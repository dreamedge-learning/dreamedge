begin;

-- ---------------------------------------------------------------------------
-- register_content_play says why it refused.
--
-- It answered `allowed: false, plays: 0, limit: 0` for three different things:
-- the caller could not be resolved to a student, the item was not published,
-- and the student had genuinely spent their replays. The player rendered all
-- three as "You've reached the replay limit for this lesson -- contact your
-- mentor if you need another look", which for an expired session is advice
-- that cannot help and a message that is not true.
--
-- So the reason is returned rather than inferred from the shape of the answer.
-- `limit` being zero was the only clue the client had, and it is the same zero
-- the function uses for "unlimited".
--
-- The rest of the function is unchanged: the count still lives on
-- student_progress, and the row lock is still what makes the check and the
-- increment one decision rather than two players both reading "one play left".
-- ---------------------------------------------------------------------------

create or replace function public.register_content_play(p_content_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_student_id();
  v_limit   int;
  v_plays   int;
begin
  if v_student is null then
    return jsonb_build_object(
      'allowed', false, 'plays', 0, 'limit', 0, 'reason', 'no_student'
    );
  end if;

  select ci.play_limit
    into v_limit
    from public.content_items ci
   where ci.id = p_content_item_id
     and ci.status = 'published';

  if not found then
    return jsonb_build_object(
      'allowed', false, 'plays', 0, 'limit', 0, 'reason', 'not_found'
    );
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
    return jsonb_build_object(
      'allowed', false,
      'plays',   v_plays,
      'limit',   v_limit,
      'reason',  'limit_reached'
    );
  end if;

  update public.student_progress
     set play_count = play_count + 1
   where student_id = v_student
     and content_item_id = p_content_item_id
  returning play_count into v_plays;

  return jsonb_build_object(
    'allowed', true,
    'plays',   v_plays,
    'limit',   coalesce(v_limit, 0),
    'reason',  'ok'
  );
end;
$$;

revoke execute on function public.register_content_play(uuid) from public, anon;
grant  execute on function public.register_content_play(uuid) to authenticated;

commit;
