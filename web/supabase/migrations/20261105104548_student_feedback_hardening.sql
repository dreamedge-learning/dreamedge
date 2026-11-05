-- Weekly leaderboard, corrected.
--
-- The first version of get_weekly_leaderboard (20261104181658) went out with
-- five problems a review caught before any client shipped against it:
--
--   1. An enrolment with valid_until null is lifetime access, as everywhere
--      else in the schema, but `valid_until > now()` is null for those rows,
--      so lifetime students could neither open the board nor appear on it.
--   2. The redaction was applied to the caller too, and the helper returned
--      an empty string for a blank name and passed through whatever a
--      student typed into the name box, an email or a phone number included.
--   3. p_week_start was used as given. Any date started its own seven-day
--      "week", so Wednesday-to-Wednesday was a different board from the real
--      one and two clients could disagree about what this week is.
--   4. Up to fifty other children's names went to anyone enrolled, and with
--      dense_rank a tie at the cut-off could return more than fifty.
--   5. Only the caller was checked for an enrolment. Every attempt on a
--      course test was ranked, so a student whose enrolment was cancelled or
--      had expired stayed on the board.
--
-- The signature and the five output columns are unchanged, so the function
-- is replaced in place and no client has to learn a new name. What changes
-- is which rows come back and what is in them.
--
-- Who is ranked: a student with an active enrolment in the course (status
-- 'active', valid_until null or in the future) whose account is active. The
-- same rule decides who may call it; an admin may call it for any course.
-- Anyone else gets an empty result rather than an error, so a shared link
-- tells a visitor nothing.
--
-- Which tests count: a test belongs to the course through tests.course_id,
-- which the exam RPCs check, or through its topic. topics.subject_id is
-- always the root subject at any folder depth, so the topic path reaches the
-- course without walking the tree.
--
-- The score: for each test, the best submitted or auto-submitted attempt in
-- the week; a student's total is the sum of those bests.
--
-- Ranking: higher total first. Equal totals go to whoever reached that total
-- first -- the latest of the moments their best on each test was first
-- scored -- and only then to student id, which never changes. Every student
-- gets a distinct rank, so "top ten" is always exactly ten rows and the same
-- data always produces the same board.
--
-- What comes back: ranks 1 to 10, plus the caller's own row when they are
-- further down. A student who has not taken a test this week has no rank and
-- no row. Other students appear as first name and last initial; the caller
-- sees their own name as they wrote it. Nothing else about a student --
-- email, phone, student code, id, school -- leaves the function.

create or replace function public._leaderboard_display_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $f$
  -- First name plus the first letter of the last word, so "  aarav   kumar
  -- sharma " becomes "Aarav S.". Names are typed by the students themselves,
  -- and a few type an email address or a phone number into the box; a first
  -- word with an @ or a digit in it is never shown, and the initial is only
  -- added when it is a letter.
  with parts as (
    select regexp_split_to_array(
             btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')),
             ' '
           ) as tokens
  ),
  picked as (
    select p.tokens[1] as first_word,
           case when array_length(p.tokens, 1) > 1
                then left(p.tokens[array_length(p.tokens, 1)], 1)
           end as initial
      from parts p
  )
  select case
    when k.first_word is null or k.first_word = '' or k.first_word ~ '[@0-9]'
      then 'Student'
    when k.initial is null or k.initial ~ '[@0-9[:punct:]]'
      then initcap(k.first_word)
    else initcap(k.first_word) || ' ' || upper(k.initial) || '.'
  end
  from picked k;
$f$;

revoke execute on function public._leaderboard_display_name(text) from public;
revoke execute on function public._leaderboard_display_name(text) from anon;
revoke execute on function public._leaderboard_display_name(text) from authenticated;

create or replace function public.get_weekly_leaderboard(
  p_course_id   uuid,
  p_week_start  date default null
) returns table (
  rank          integer,
  display_name  text,
  total_score   numeric,
  tests_taken   integer,
  is_me         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
  v_week        date;
  v_from        timestamptz;
  v_to          timestamptz;
  v_student_id  uuid := public.current_student_id();
  v_is_admin    boolean := public.is_admin();
begin
  if p_course_id is null then
    return;
  end if;

  -- Snap to the Monday of the week in IST, whatever day was passed, and use
  -- today in IST when nothing was. date_trunc('week') is the ISO week, which
  -- starts on Monday. IST has no daylight saving, so the window is always
  -- exactly seven days: Sunday 23:59 IST counts, Monday 00:00 IST does not.
  v_week := date_trunc(
              'week',
              coalesce(p_week_start::timestamp, pg_catalog.now() at time zone 'Asia/Kolkata')
            )::date;
  v_from := v_week::timestamp at time zone 'Asia/Kolkata';
  v_to   := (v_week + 7)::timestamp at time zone 'Asia/Kolkata';

  if not v_is_admin and not exists (
    select 1
      from public.enrollments e
      join public.students    st on st.id = e.student_id
     where e.student_id = v_student_id
       and e.course_id  = p_course_id
       and e.status     = 'active'
       and (e.valid_until is null or e.valid_until > pg_catalog.now())
       and st.status    = 'active'::public.student_status
  ) then
    return;
  end if;

  return query
  with
  course_tests as (
    select t.id as test_id
      from public.tests t
      left join public.topics   tp on tp.id = t.topic_id
      left join public.subjects s  on s.id  = tp.subject_id
     where t.course_id = p_course_id
        or s.course_id = p_course_id
  ),
  eligible as (
    select distinct e.student_id
      from public.enrollments e
      join public.students    st on st.id = e.student_id
     where e.course_id = p_course_id
       and e.status    = 'active'
       and (e.valid_until is null or e.valid_until > pg_catalog.now())
       and st.status   = 'active'::public.student_status
  ),
  -- Per student and test, the best score and the first time it was scored.
  best as (
    select distinct on (a.student_id, a.test_id)
           a.student_id,
           a.test_id,
           a.score        as best_score,
           a.submitted_at as reached_at
      from public.test_attempts a
      join course_tests ct on ct.test_id    = a.test_id
      join eligible     el on el.student_id = a.student_id
     where a.status in ('submitted', 'auto_submitted')
       and a.score is not null
       and a.submitted_at >= v_from
       and a.submitted_at <  v_to
     order by a.student_id, a.test_id, a.score desc, a.submitted_at asc
  ),
  per_student as (
    select b.student_id,
           sum(b.best_score)::numeric as score_sum,
           count(*)::integer          as test_count,
           max(b.reached_at)          as reached_at
      from best b
     group by b.student_id
  ),
  ranked as (
    select ps.student_id,
           ps.score_sum,
           ps.test_count,
           (row_number() over (
              order by ps.score_sum desc, ps.reached_at asc, ps.student_id asc
            ))::integer as pos
      from per_student ps
  )
  select r.pos,
         case
           when r.student_id = v_student_id then
             coalesce(
               nullif(btrim(regexp_replace(st.full_name, '\s+', ' ', 'g')), ''),
               'You'
             )
           else public._leaderboard_display_name(st.full_name)
         end,
         r.score_sum,
         r.test_count,
         coalesce(r.student_id = v_student_id, false)
    from ranked r
    join public.students st on st.id = r.student_id
   where r.pos <= 10
      or r.student_id = v_student_id
   order by r.pos;
end;
$f$;

revoke execute on function public.get_weekly_leaderboard(uuid, date) from public;
revoke execute on function public.get_weekly_leaderboard(uuid, date) from anon;
grant  execute on function public.get_weekly_leaderboard(uuid, date) to authenticated;

comment on function public.get_weekly_leaderboard(uuid, date) is
  'Weekly course leaderboard for the IST Monday-to-Monday week containing '
  'p_week_start (default: this week). Ranks actively enrolled students by the '
  'sum of their best score per test; ties go to whoever reached the total '
  'first. Returns ranks 1-10 plus the caller row if lower. Other students are '
  'first name and last initial. Callable by an actively enrolled student of '
  'the course or an admin; anyone else gets no rows.';
