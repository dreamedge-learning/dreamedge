-- Weekly leaderboard RPC for a course.
--
-- One source of truth for the ranking the app and the website both render.
-- The old Flutter service computed rankings on the client by reading other
-- students' test_attempts, which RLS correctly blocks, so it could never have
-- worked. Centralising here means the ranking rule is one place, the privacy
-- redaction is one place, and the enrolment/admin gate is one place.
--
-- The week is Monday 00:00 (inclusive) to next Monday 00:00 (exclusive) in
-- Asia/Kolkata. IST does not observe DST, so the window is always exactly
-- seven days. Sunday 23:30 IST is the last minute that counts; Monday 00:10
-- IST belongs to the next week.

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
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_week_start  timestamptz;
  v_week_end    timestamptz;
  v_student_id  uuid;
  v_is_admin    boolean;
  v_enrolled    boolean;
begin
  -- Resolve the IST week. A null p_week_start means the current week;
  -- date_trunc('week', ...) returns ISO-week Monday 00:00.
  if p_week_start is null then
    v_week_start := date_trunc('week', (now() at time zone 'Asia/Kolkata'))
                      at time zone 'Asia/Kolkata';
  else
    v_week_start := (p_week_start::timestamp) at time zone 'Asia/Kolkata';
  end if;
  v_week_end := v_week_start + interval '7 days';

  v_is_admin   := public.is_admin();
  v_student_id := public.current_student_id();

  -- Gate: admin or an active, unexpired enrolment in that course. Everyone
  -- else gets an empty result, not an error. A visitor browsing a shared URL
  -- should see nothing, not learn that the route exists.
  if v_is_admin then
    v_enrolled := true;
  else
    select exists(
      select 1
        from public.enrollments e
       where e.student_id = v_student_id
         and e.course_id  = p_course_id
         and e.status     = 'active'
         and e.valid_until > now()
    ) into v_enrolled;
  end if;

  if not v_enrolled then
    return;
  end if;

  return query
  with
  -- tests.topic_id can be null; exclude those. Nested folders are fine --
  -- topics.subject_id always points at the root subject, so joining through
  -- subject_id reaches the course at any folder depth.
  course_tests as (
    select t.id as test_id
      from public.tests    t
      join public.topics   tp on tp.id = t.topic_id
      join public.subjects s  on s.id  = tp.subject_id
     where s.course_id   = p_course_id
       and t.topic_id    is not null
  ),
  -- A submitted attempt is one that reached the server end-of-exam path.
  -- Both 'submitted' (student tapped Submit) and 'auto_submitted' (clock ran
  -- out) count; 'in_progress' and 'abandoned' do not.
  best_per_test as (
    select a.student_id,
           a.test_id,
           max(a.score) as best_score
      from public.test_attempts a
      join course_tests         ct on ct.test_id = a.test_id
     where a.status in ('submitted','auto_submitted')
       and a.submitted_at is not null
       and a.score         is not null
       and a.submitted_at >= v_week_start
       and a.submitted_at <  v_week_end
     group by a.student_id, a.test_id
  ),
  per_student as (
    select bp.student_id,
           sum(bp.best_score)::numeric       as total_score,
           count(distinct bp.test_id)::int   as tests_taken
      from best_per_test bp
     group by bp.student_id
  ),
  ranked as (
    select
      dense_rank() over (order by ps.total_score desc)::int as rnk,
      ps.student_id,
      ps.total_score,
      ps.tests_taken,
      st.full_name
    from per_student ps
    join public.students st on st.id = ps.student_id
  ),
  -- Top 50 plus the caller's own row if they are outside it. If the caller is
  -- already in the top 50, the OR does not add a duplicate -- student_id is
  -- unique per row in the ranked CTE.
  trimmed as (
    select r.*
      from ranked r
     where r.rnk <= 50
        or r.student_id = v_student_id
  )
  select
    t.rnk                                          as rank,
    public._leaderboard_display_name(t.full_name)  as display_name,
    t.total_score,
    t.tests_taken,
    coalesce(t.student_id = v_student_id, false)   as is_me
    from trimmed t
   order by t.rnk asc, t.full_name asc nulls last, t.student_id;
end;
$fn$;

-- Privacy: first name + capitalised initial of last token with a dot.
-- Children's names -- no surnames, no phones, no schools, no student codes.
-- Collapses runs of whitespace so "  Aarav   Sharma " yields "Aarav S.".
create or replace function public._leaderboard_display_name(p_full_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with parts as (
    select regexp_split_to_array(
             btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')),
             ' '
           ) as tokens
  )
  select case
    when p.tokens is null or array_length(p.tokens, 1) is null then 'Student'
    when array_length(p.tokens, 1) = 1 then initcap(p.tokens[1])
    else initcap(p.tokens[1])
         || ' '
         || upper(substr(p.tokens[array_length(p.tokens, 1)], 1, 1))
         || '.'
  end
  from parts p;
$$;

revoke execute on function public.get_weekly_leaderboard(uuid, date) from public;
revoke execute on function public.get_weekly_leaderboard(uuid, date) from anon;
grant  execute on function public.get_weekly_leaderboard(uuid, date) to authenticated;

revoke execute on function public._leaderboard_display_name(text) from public;
revoke execute on function public._leaderboard_display_name(text) from anon;
revoke execute on function public._leaderboard_display_name(text) from authenticated;

comment on function public.get_weekly_leaderboard(uuid, date) is
  'Weekly course leaderboard, IST Monday-to-Monday. Returns top 50 plus the '
  'caller row if they are outside it. Gated to enrolled students or admins; '
  'everyone else gets an empty result.';
