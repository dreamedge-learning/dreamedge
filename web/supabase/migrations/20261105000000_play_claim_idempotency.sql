-- register_content_play, with an idempotency key.
--
-- The player used to call the RPC once per lesson open: the server would
-- increment the play count, hand back the new count, and the client cached
-- `_playClaimed = true` so retries were no-ops. A network timeout AFTER the
-- increment broke the cache: the response never reached the client, the catch
-- block returned true without setting `_playClaimed`, and the next retry hit
-- the server again -- a second replay out of the student's budget, for the
-- same play.
--
-- Fix: the client generates a UUID per play intent and sends it with every
-- call. The server records (student, content_item, key) on first use and
-- returns the stored decision on subsequent calls with the same key.
-- Retrying under a dropped response then produces the same `allowed`, the
-- same `plays`, the same `limit`, and the count moves at most once per
-- intent.
--
-- The row is kept for 24 hours. A longer window would make a determined
-- attacker's stored key a licence they could reuse later; shorter would
-- miss the real failure mode (a mobile network dropping the response from
-- a request that reached the server). A sweep is unnecessary -- rows carry
-- a `claimed_at` and the lookup clause rejects anything older than the
-- window, so stale rows are inert.

begin;

-- ---------------------------------------------------------------------------
-- Claim table
-- ---------------------------------------------------------------------------

create table if not exists public.play_claims (
  id              uuid primary key,
  student_id      uuid not null references public.students(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  claimed_at      timestamptz not null default now(),
  decision        jsonb not null
);

create index if not exists idx_play_claims_recent
  on public.play_claims (student_id, content_item_id, claimed_at desc);

alter table public.play_claims enable row level security;

-- No policy. The table is written and read only by `register_content_play`,
-- which runs as its owner. RLS on with no policy means no direct access,
-- the same shape rate_limit_hits uses for its own throttle rows.
comment on table public.play_claims is
  'Idempotency keys for register_content_play. RLS on with no policy on '
  'purpose: reached only through the RPC, which is SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- Function
-- ---------------------------------------------------------------------------

create or replace function public.register_content_play(
  p_content_item_id uuid,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_student_id();
  v_limit    int;
  v_plays    int;
  v_previous jsonb;
  v_result   jsonb;
begin
  if v_student is null then
    return jsonb_build_object(
      'allowed', false, 'plays', 0, 'limit', 0, 'reason', 'no_student'
    );
  end if;

  -- An existing claim for this key returns its stored decision. The retry
  -- after a dropped response then sees the same allowed/plays/limit it
  -- would have seen the first time, and does not increment again.
  --
  -- Keys older than a day are ignored. A caller still holding one past the
  -- window has either been offline a long time or is reusing an old intent;
  -- either way, a fresh RPC call is the honest outcome, and the count is
  -- the record of what the student really watched.
  if p_idempotency_key is not null then
    select pc.decision
      into v_previous
      from public.play_claims pc
     where pc.id = p_idempotency_key
       and pc.student_id = v_student
       and pc.content_item_id = p_content_item_id
       and pc.claimed_at > now() - interval '24 hours';

    if found then
      return v_previous;
    end if;
  end if;

  select ci.play_limit
    into v_limit
    from public.content_items ci
   where ci.id = p_content_item_id
     and ci.status = 'published';

  if not found then
    v_result := jsonb_build_object(
      'allowed', false, 'plays', 0, 'limit', 0, 'reason', 'not_found'
    );
    -- Not recorded: a key reused against a different (now-published) item
    -- would otherwise lock in `not_found` for a day. The not-found path has
    -- nothing worth caching anyway.
    return v_result;
  end if;

  insert into public.student_progress (student_id, content_item_id, status)
  values (v_student, p_content_item_id, 'in_progress')
  on conflict (student_id, content_item_id) do nothing;

  select sp.play_count
    into v_plays
    from public.student_progress sp
   where sp.student_id = v_student
     and sp.content_item_id = p_content_item_id
     for update;

  if v_limit is not null and v_plays >= v_limit then
    v_result := jsonb_build_object(
      'allowed', false,
      'plays',   v_plays,
      'limit',   v_limit,
      'reason',  'limit_reached'
    );
  else
    update public.student_progress
       set play_count = play_count + 1
     where student_id = v_student
       and content_item_id = p_content_item_id
    returning play_count into v_plays;

    v_result := jsonb_build_object(
      'allowed', true,
      'plays',   v_plays,
      'limit',   coalesce(v_limit, 0),
      'reason',  'ok'
    );
  end if;

  if p_idempotency_key is not null then
    insert into public.play_claims (id, student_id, content_item_id, decision)
    values (p_idempotency_key, v_student, p_content_item_id, v_result)
    on conflict (id) do nothing;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.register_content_play(uuid, uuid) from public, anon;
grant  execute on function public.register_content_play(uuid, uuid) to authenticated;

-- The old single-argument signature stays grantable so a client that has not
-- been upgraded yet keeps working. New installs always send the key.
revoke execute on function public.register_content_play(uuid) from public, anon;
grant  execute on function public.register_content_play(uuid) to authenticated;

commit;
