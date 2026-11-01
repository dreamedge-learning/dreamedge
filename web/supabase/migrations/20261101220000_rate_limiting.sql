-- ---------------------------------------------------------------------------
-- Request rate limiting.
--
-- The auth and contact server actions were unthrottled. `startPhoneOtp` is the
-- sharpest edge: every call spends an SMS credit, so an unthrottled endpoint is
-- a direct cost attack as well as a way to harass a phone number. Password
-- reset and the contact form are the other two worth gating.
--
-- Counting happens in Postgres rather than in process memory because the site
-- runs on serverless functions -- each invocation may be a fresh instance, so
-- an in-memory counter resets constantly and enforces nothing.
--
-- The window is sliding: `check_rate_limit` prunes hits older than the window
-- before counting, so a caller who is blocked recovers gradually rather than
-- waiting for a fixed bucket to roll over.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_hits (
  id          bigserial primary key,
  bucket      text        not null,
  identifier  text        not null,
  created_at  timestamptz not null default now()
);

-- The lookup is always (bucket, identifier, recent-first).
create index if not exists rate_limit_hits_lookup_idx
  on public.rate_limit_hits (bucket, identifier, created_at desc);

-- Nothing but the definer function should touch this table.
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
revoke all on sequence public.rate_limit_hits_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- check_rate_limit
--
-- Records an attempt and reports whether the caller is over the limit.
--
-- Returns jsonb: { allowed boolean, remaining int, retry_after int }
--   retry_after is seconds until the oldest hit in the window expires, so the
--   caller can tell the user when to try again instead of a bare refusal.
--
-- The hit is recorded only when it is allowed. Counting blocked attempts would
-- let a caller who is already over the limit extend their own lockout
-- indefinitely by continuing to hammer the endpoint.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_limit          integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window   interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_count    integer;
  v_oldest   timestamptz;
  v_retry    integer;
begin
  if p_identifier is null or btrim(p_identifier) = '' then
    -- No usable key (no forwarded IP, no email). Fail open rather than lock
    -- every anonymous visitor out of the form.
    return jsonb_build_object('allowed', true, 'remaining', p_limit, 'retry_after', 0);
  end if;

  delete from rate_limit_hits
   where bucket = p_bucket
     and identifier = p_identifier
     and created_at < now() - v_window;

  select count(*), min(created_at)
    into v_count, v_oldest
    from rate_limit_hits
   where bucket = p_bucket
     and identifier = p_identifier;

  if v_count >= p_limit then
    v_retry := greatest(
      ceil(extract(epoch from (v_oldest + v_window - now())))::integer,
      1
    );
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_retry);
  end if;

  insert into rate_limit_hits (bucket, identifier) values (p_bucket, p_identifier);

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(p_limit - v_count - 1, 0),
    'retry_after', 0
  );
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Housekeeping. Rows are pruned per-key on read, but a key that is never hit
-- again keeps its rows forever. This clears anything older than a day and is
-- safe to call from a scheduled job.
-- ---------------------------------------------------------------------------
create or replace function public.prune_rate_limit_hits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_hits where created_at < now() - interval '1 day';
$$;

revoke all on function public.prune_rate_limit_hits() from public, anon, authenticated;
grant execute on function public.prune_rate_limit_hits() to service_role;
