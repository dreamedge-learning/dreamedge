-- ---------------------------------------------------------------------------
-- Somewhere to count plays, so `play_limit` means something.
--
-- `content_items.play_limit` has existed since the initial schema and the
-- panel has always offered it, but nothing ever counted a play, so the field
-- was decoration: a lesson capped at two views played forever.
--
-- The count belongs on `student_progress`. It is already unique on
-- (student_id, content_item_id), which is exactly the grain a replay limit is
-- measured at, and it is already the row the player writes to.
--
-- Counting on the device was the alternative and is not good enough: a
-- reinstall would hand back every replay, which is the first thing anyone
-- tries. The increment runs here instead, under a row lock, so two taps in
-- quick succession cannot both slip past the last allowed play.
--
-- What this does not do is make the limit unforgeable. A client that simply
-- never calls this function is not stopped, in the same way that a signed URL
-- can be copied out of a browser within its window. Both are the normal
-- ceiling for content delivered to a device the student controls, and both are
-- what the Mux move in Phase 2 is for.
-- ---------------------------------------------------------------------------

begin;

alter table public.student_progress
  add column if not exists play_count integer not null default 0;

comment on column public.student_progress.play_count is
  'Times this student has started this lesson. Compared against content_items.play_limit.';

-- ---------------------------------------------------------------------------
-- register_content_play: claims one play, or refuses.
--
-- Returns `allowed`, the running total and the limit in force, so the player
-- can say "you have reached the replay limit for this lesson" rather than
-- failing with nothing to explain. A null limit means unlimited and always
-- allows.
--
-- The progress row is created if it does not exist yet. A student who opens a
-- lesson and leaves has started it, and the row has to be there for the count
-- to live anywhere.
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
    return jsonb_build_object('allowed', false, 'plays', 0, 'limit', 0);
  end if;

  select ci.play_limit
    into v_limit
    from public.content_items ci
   where ci.id = p_content_item_id
     and ci.status = 'published';

  if not found then
    return jsonb_build_object('allowed', false, 'plays', 0, 'limit', 0);
  end if;

  insert into public.student_progress (student_id, content_item_id, status)
  values (v_student, p_content_item_id, 'in_progress')
  on conflict (student_id, content_item_id) do nothing;

  -- The lock is what makes the check and the increment one decision. Without
  -- it, two players opening at once both read "one play left".
  select sp.play_count
    into v_plays
    from public.student_progress sp
   where sp.student_id = v_student
     and sp.content_item_id = p_content_item_id
     for update;

  if v_limit is not null and v_plays >= v_limit then
    return jsonb_build_object('allowed', false, 'plays', v_plays, 'limit', v_limit);
  end if;

  update public.student_progress
     set play_count = play_count + 1
   where student_id = v_student
     and content_item_id = p_content_item_id
  returning play_count into v_plays;

  return jsonb_build_object(
    'allowed', true,
    'plays', v_plays,
    'limit', coalesce(v_limit, 0)
  );
end;
$$;

revoke execute on function public.register_content_play(uuid) from public, anon;
grant  execute on function public.register_content_play(uuid) to authenticated;

commit;
