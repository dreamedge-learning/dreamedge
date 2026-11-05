-- ---------------------------------------------------------------------------
-- Course ratings, second pass: short written reviews, moderation, and the
-- holes the first migration left open.
--
-- What changes, and why:
--
--   * A rating may carry an optional review of up to 500 characters. The
--     public course page shows reviews under the reviewer's first name and
--     last initial and nothing else: no email, phone, student id or class.
--     Those come out of `course_reviews`, never from the table itself, which
--     anonymous visitors cannot read at all.
--
--   * Who may rate: a student with an active, unexpired enrolment who has
--     finished at least one lesson of the course. Enrolling in a free course
--     takes one tap, so without the lesson rule anybody could sign up and
--     leave one star on a course they never opened. One lesson is a low bar
--     for a real student and a real cost for a drive-by.
--
--   * Who the rating belongs to, when it was made and whether it is hidden are
--     set by the database from the session, not taken from the request. A
--     student can change their stars and their review and nothing else.
--
--   * Writes are rate limited per student through `check_rate_limit`, the
--     same way doubts are, so a stuck client cannot hammer the aggregate.
--
--   * Super admin and support staff can hide an abusive review and restore it
--     later, through `set_course_rating_hidden`, which writes the audit log
--     in the same transaction. A hidden rating stops counting towards the
--     course's average and stops showing on the course page; its author still
--     sees it, marked as hidden, and can still edit it.
--
--   * The aggregate on `courses` now excludes hidden ratings, locks the course
--     row while it counts (two students rating at once could otherwise each
--     write a total that misses the other), and no longer moves the course's
--     `updated_at`, which the sitemap and the admin lists read as "the course
--     was edited".
--
--   * Nobody but the aggregate can write `courses.rating_avg` or
--     `rating_count`. Content admins can update courses, and a hand-typed
--     4.9 is exactly what this feature exists to replace.
--
--   * Privileges are narrowed: anonymous visitors had every privilege on the
--     table (RLS was the only thing in the way), and the trigger functions
--     were executable by anyone. Security definer functions now pin
--     `search_path` to empty and qualify every name.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Shape
-- ---------------------------------------------------------------------------

-- The audit log and the moderation screen need a single-column key to point
-- at; the (student, course) pair stays the primary key that upserts rely on.
alter table public.course_ratings
  add column if not exists id            uuid        not null default gen_random_uuid(),
  add column if not exists review        text,
  add column if not exists is_hidden     boolean     not null default false,
  add column if not exists hidden_at     timestamptz,
  -- Copied at the time, like a doubt reply's author name: the moderator's
  -- account may be gone by the time anyone asks, and the audit log has the id.
  add column if not exists hidden_by_name text,
  add column if not exists hidden_reason text;

alter table public.course_ratings
  add constraint course_ratings_id_key unique (id),
  -- Long enough to say what helped and what did not, short enough to read on
  -- a phone without a "read more".
  add constraint course_ratings_review_length
    check (review is null or char_length(review) between 1 and 500),
  add constraint course_ratings_hidden_reason_length
    check (hidden_reason is null or char_length(hidden_reason) between 3 and 500),
  -- A visible rating carries no moderation details; restoring one clears
  -- them, and the audit log keeps the history.
  add constraint course_ratings_hidden_consistent
    check (is_hidden or (hidden_at is null and hidden_by_name is null and hidden_reason is null));

comment on table public.course_ratings is
  'One 1-5 star rating per (student, course), with an optional short review. Public display goes through course_reviews().';

-- The course page lists visible written reviews, newest first.
create index if not exists course_ratings_public_reviews_idx
  on public.course_ratings (course_id, updated_at desc)
  where not is_hidden and review is not null;

-- ---------------------------------------------------------------------------
-- 2. Privileges
--
-- Nothing here is for anonymous visitors. Signed-in users keep SELECT, INSERT
-- and UPDATE, and the policies decide which rows. A student cannot remove a
-- rating, only change it.
-- ---------------------------------------------------------------------------
revoke all on public.course_ratings from anon;
revoke all on public.course_ratings from authenticated;
grant select, insert, update on public.course_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who may rate
--
-- Security definer because the lesson check walks content_items, topics and
-- subjects, and a student's own read policies on those hide unpublished
-- lessons they may well have finished before an admin unpublished them.
-- It only ever answers for the signed-in student, so it reveals nothing about
-- anybody else.
-- ---------------------------------------------------------------------------
create or replace function public.can_rate_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
  select exists (
           select 1
             from public.enrollments e
            where e.student_id = public.current_student_id()
              and e.course_id  = p_course_id
              and e.status     = 'active'
              and (e.valid_until is null or e.valid_until > now())
         )
     and exists (
           select 1
             from public.student_progress sp
             join public.content_items ci on ci.id = sp.content_item_id
             join public.topics t         on t.id  = ci.topic_id
             join public.subjects s       on s.id  = t.subject_id
            where sp.student_id = public.current_student_id()
              and s.course_id   = p_course_id
              and (sp.status = 'completed'
                   or sp.progress_percentage >= 100
                   or sp.completed_at is not null)
         );
$f$;

revoke execute on function public.can_rate_course(uuid) from public, anon;
grant  execute on function public.can_rate_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Policies
--
-- Wrapping the helper calls in a sub-select lets Postgres evaluate them once
-- per statement instead of once per row.
--
-- Reading everybody's ratings is for the moderators only. Other admin roles
-- see the aggregate on the course like everyone else.
-- ---------------------------------------------------------------------------
alter policy course_ratings_select_own on public.course_ratings
  using (student_id = (select public.current_student_id()));

alter policy course_ratings_select_admin on public.course_ratings
  using ((select public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[])));

alter policy course_ratings_insert_own on public.course_ratings
  with check (
    student_id = (select public.current_student_id())
    and public.can_rate_course(course_id)
  );

alter policy course_ratings_update_own on public.course_ratings
  using (student_id = (select public.current_student_id()))
  with check (
    student_id = (select public.current_student_id())
    and public.can_rate_course(course_id)
  );

-- ---------------------------------------------------------------------------
-- 5. course_ratings_guard_write
--
-- Pins everything about a rating that the student must not choose, and
-- refuses any change to it afterwards. The review is trimmed for every
-- writer, and an empty one is stored as no review at all.
--
-- Not security definer, on purpose, for the same reason as
-- `doubts_guard_update`: the test is on the effective role, and inside a
-- definer function that is always the owner. The moderation function updates
-- the hidden columns as the owner, which is how the one sanctioned path gets
-- past this guard.
-- ---------------------------------------------------------------------------
create or replace function public.course_ratings_guard_write()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  new.review := nullif(btrim(new.review), '');

  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.student_id := public.current_student_id();
      if new.student_id is null then
        raise exception 'Only a signed-in student can rate a course.'
          using errcode = '42501';
      end if;

      new.id            := gen_random_uuid();
      new.created_at    := now();
      new.updated_at    := now();
      new.is_hidden     := false;
      new.hidden_at     := null;
      new.hidden_by_name := null;
      new.hidden_reason := null;
    else
      if new.id            is distinct from old.id
         or new.student_id is distinct from old.student_id
         or new.course_id  is distinct from old.course_id
         or new.created_at is distinct from old.created_at then
        raise exception 'Only the stars and the review of a rating can be changed.'
          using errcode = '42501';
      end if;

      if new.is_hidden        is distinct from old.is_hidden
         or new.hidden_at     is distinct from old.hidden_at
         or new.hidden_by_name is distinct from old.hidden_by_name
         or new.hidden_reason is distinct from old.hidden_reason then
        raise exception 'Only the Dream Edge team can hide or restore a review.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$f$;

revoke execute on function public.course_ratings_guard_write() from public, anon, authenticated;

create or replace trigger course_ratings_guard_write
  before insert or update on public.course_ratings
  for each row execute function public.course_ratings_guard_write();

-- ---------------------------------------------------------------------------
-- 6. course_ratings_rate_limit
--
-- Runs after the guard (triggers fire in name order), so `student_id` is the
-- session's. Security definer because `check_rate_limit` is not executable by
-- signed-in users, who could otherwise reset their own counters.
--
-- Only a change to the stars or the review counts: a moderator hiding a
-- review is not the student writing. Re-rating through an upsert passes both
-- the insert and the update trigger, so a re-rate costs two hits; the ceiling
-- is set with that in mind and is still far above what a real student does.
-- The hit is only kept if the write commits, so a refused rating is free.
-- ---------------------------------------------------------------------------
create or replace function public.course_ratings_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_limit jsonb;
  v_wait  integer;
begin
  if tg_op = 'UPDATE'
     and new.stars  is not distinct from old.stars
     and new.review is not distinct from old.review then
    return new;
  end if;

  -- The service role and maintenance scripts have no student; RLS and the
  -- guard already stop a signed-in non-student from getting here.
  if public.current_student_id() is null then
    return new;
  end if;

  v_limit := public.check_rate_limit('course_rating_write', new.student_id::text, 30, 3600);

  if not coalesce((v_limit ->> 'allowed')::boolean, true) then
    v_wait := greatest(coalesce((v_limit ->> 'retry_after')::integer, 60), 60);
    -- PT429 is PostgREST's convention for "answer with HTTP 429", so both
    -- clients can show this message as it is.
    raise exception '%', format(
      'You have changed your ratings a lot recently. Please try again in %s.',
      case
        when v_wait <= 60 then '1 minute'
        else ceil(v_wait / 60.0)::integer || ' minutes'
      end
    ) using errcode = 'PT429';
  end if;

  return new;
end;
$f$;

revoke execute on function public.course_ratings_rate_limit() from public, anon, authenticated;

create or replace trigger course_ratings_rate_limit
  before insert or update on public.course_ratings
  for each row execute function public.course_ratings_rate_limit();

-- ---------------------------------------------------------------------------
-- 7. updated_at
--
-- Moves only when the student changes what they said. Hiding or restoring a
-- review must not bump it to the top of the course page's newest-first list.
-- ---------------------------------------------------------------------------
create or replace function public.course_ratings_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if new.stars is distinct from old.stars
     or new.review is distinct from old.review then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$f$;

revoke execute on function public.course_ratings_set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The aggregate
--
-- `recompute_course_rating` locks the course row before counting. Under READ
-- COMMITTED each statement takes a fresh snapshot, so the second of two
-- concurrent writers waits on the lock and then counts the first writer's
-- committed row, instead of both writing a total that misses the other.
-- It writes only when the numbers actually change.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_course_rating(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_count integer;
  v_avg   numeric(2,1);
begin
  perform 1
     from public.courses c
    where c.id = p_course_id
      for update;

  if not found then
    return;
  end if;

  select count(*)::integer,
         round(avg(r.stars)::numeric, 1)
    into v_count, v_avg
    from public.course_ratings r
   where r.course_id = p_course_id
     and not r.is_hidden;

  update public.courses c
     set rating_count = v_count,
         rating_avg   = case when v_count = 0 then null else v_avg end
   where c.id = p_course_id
     and (c.rating_count is distinct from v_count
          or c.rating_avg is distinct from (case when v_count = 0 then null else v_avg end));
end;
$f$;

revoke execute on function public.recompute_course_rating(uuid) from public, anon, authenticated;

-- A trigger function: it cannot be called on its own (Postgres refuses to run
-- a trigger function outside a trigger), so the advisor's "anon can execute a
-- security definer function" was never reachable. It is revoked anyway so the
-- warning goes, and so it stays unreachable if it ever stops being one.
create or replace function public.course_ratings_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_course_rating(new.course_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- A new review text does not move the numbers.
    if new.stars        is not distinct from old.stars
       and new.is_hidden is not distinct from old.is_hidden
       and new.course_id is not distinct from old.course_id then
      return new;
    end if;

    perform public.recompute_course_rating(new.course_id);
    if new.course_id is distinct from old.course_id then
      perform public.recompute_course_rating(old.course_id);
    end if;
    return new;
  end if;

  -- A rating removed along with its student or its course.
  perform public.recompute_course_rating(old.course_id);
  return old;
end;
$f$;

revoke execute on function public.course_ratings_aggregate() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. courses: the rating columns belong to the aggregate
--
-- Not security definer, so `current_user` is the caller's role; the aggregate
-- runs as the owner and passes. A new course always starts unrated.
-- ---------------------------------------------------------------------------
create or replace function public.courses_guard_rating_columns()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.rating_avg   := null;
      new.rating_count := 0;
    elsif new.rating_avg is distinct from old.rating_avg
          or new.rating_count is distinct from old.rating_count then
      raise exception 'A course''s rating comes from its students and cannot be edited.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$f$;

revoke execute on function public.courses_guard_rating_columns() from public, anon, authenticated;

create or replace trigger courses_guard_rating_columns
  before insert or update on public.courses
  for each row execute function public.courses_guard_rating_columns();

-- A rating changing the average is not the course being edited.
create or replace function public.update_courses_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if (to_jsonb(new) - 'rating_avg' - 'rating_count' - 'updated_at')
     = (to_jsonb(old) - 'rating_avg' - 'rating_count' - 'updated_at') then
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$f$;

-- ---------------------------------------------------------------------------
-- 10. Moderation
--
-- Hiding needs a reason. The student sees that their review was hidden and
-- why, so the reason is written for them; the audit log keeps who did it and
-- what the review said at the time.
-- ---------------------------------------------------------------------------
create or replace function public.set_course_rating_hidden(
  p_rating_id uuid,
  p_hidden    boolean,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_admin  text;
  v_row    public.course_ratings%rowtype;
begin
  if not public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[]) then
    raise exception 'Only a super admin or support staff can moderate reviews.'
      using errcode = '42501';
  end if;

  if p_hidden is null then
    raise exception 'Say whether the review should be hidden or shown.'
      using errcode = '22023';
  end if;

  if p_hidden and char_length(coalesce(v_reason, '')) < 3 then
    raise exception 'Give a reason for hiding this review.'
      using errcode = '22023';
  end if;

  v_reason := left(v_reason, 500);

  select au.full_name
    into v_admin
    from public.admin_users au
   where au.user_id = auth.uid()
     and au.is_active
   limit 1;

  select r.*
    into v_row
    from public.course_ratings r
   where r.id = p_rating_id
     for update;

  if not found then
    raise exception 'That review could not be found.'
      using errcode = 'P0002';
  end if;

  if v_row.is_hidden = p_hidden then
    raise exception '%', case when p_hidden
                              then 'That review is already hidden.'
                              else 'That review is already visible.' end
      using errcode = 'P0002';
  end if;

  update public.course_ratings r
     set is_hidden     = p_hidden,
         hidden_at     = case when p_hidden then now() end,
         hidden_by_name = case when p_hidden then coalesce(v_admin, 'Dream Edge team') end,
         hidden_reason = case when p_hidden then v_reason end
   where r.id = p_rating_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    auth.uid(),
    case when p_hidden then 'hide' else 'restore' end,
    'course_rating',
    p_rating_id,
    jsonb_build_object('is_hidden', v_row.is_hidden, 'hidden_reason', v_row.hidden_reason),
    jsonb_build_object('is_hidden', p_hidden, 'reason', v_reason),
    jsonb_build_object(
      'course_id',  v_row.course_id,
      'student_id', v_row.student_id,
      'stars',      v_row.stars,
      'review',     v_row.review
    )
  );
end;
$f$;

revoke execute on function public.set_course_rating_hidden(uuid, boolean, text) from public, anon;
grant  execute on function public.set_course_rating_hidden(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. course_reviews: what the public course page shows
--
-- Security definer, and executable by anonymous visitors, on purpose: the
-- reviews are public, but the table and `students` are not, and this is the
-- one shape of them that is safe to hand out. It returns the first name and
-- last initial, the stars, the text and a date -- no student id, no rating
-- id, nothing to contact or look a child up by. Written reviews only (the
-- stars on their own are already in the course's average), visible ones
-- only, on published courses only.
-- ---------------------------------------------------------------------------
create or replace function public.course_reviews(
  p_course_id uuid,
  p_limit     integer default 10,
  p_offset    integer default 0
)
returns table (
  reviewer_name text,
  stars         smallint,
  review        text,
  reviewed_at   timestamptz,
  total_count   bigint
)
language sql
stable
security definer
set search_path = ''
as $f$
  select case
           when n.parts is null or n.parts[1] is null or n.parts[1] = '' then 'A student'
           when cardinality(n.parts) = 1 then initcap(left(n.parts[1], 30))
           else initcap(left(n.parts[1], 30)) || ' '
                || upper(left(n.parts[cardinality(n.parts)], 1)) || '.'
         end,
         r.stars,
         r.review,
         r.updated_at,
         count(*) over ()
    from public.course_ratings r
    join public.courses c  on c.id = r.course_id and c.is_published
    join public.students s on s.id = r.student_id
    cross join lateral (
      select regexp_split_to_array(btrim(coalesce(s.full_name, '')), '\s+') as parts
    ) n
   where r.course_id = p_course_id
     and not r.is_hidden
     and r.review is not null
   order by r.updated_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$f$;

revoke execute on function public.course_reviews(uuid, integer, integer) from public;
grant  execute on function public.course_reviews(uuid, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. my_course_ratings: the student's own ratings, and where they may rate
--
-- One row per active enrolment, so My Courses on the website and My Learning
-- in the app get everything they need in one call, including whether to
-- offer the stars at all. Security invoker: it reads the caller's own rows
-- through their own policies.
-- ---------------------------------------------------------------------------
create or replace function public.my_course_ratings()
returns table (
  course_id     uuid,
  can_rate      boolean,
  stars         smallint,
  review        text,
  is_hidden     boolean,
  hidden_reason text,
  updated_at    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $f$
  select distinct on (e.course_id)
         e.course_id,
         public.can_rate_course(e.course_id),
         r.stars,
         r.review,
         coalesce(r.is_hidden, false),
         r.hidden_reason,
         r.updated_at
    from public.enrollments e
    left join public.course_ratings r
           on r.student_id = e.student_id
          and r.course_id  = e.course_id
   where e.student_id = (select public.current_student_id())
     and e.status = 'active'
   order by e.course_id;
$f$;

revoke execute on function public.my_course_ratings() from public, anon;
grant  execute on function public.my_course_ratings() to authenticated;

-- ---------------------------------------------------------------------------
-- 13. admin_list_course_ratings: the moderation screen
--
-- One page of ratings with the student and course resolved, and the total for
-- the pager. Security invoker: it reads through the caller's RLS, so only
-- super admin and support staff see any rows.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_course_ratings(
  p_course_id uuid     default null,
  p_status    text     default null,
  p_stars     smallint default null,
  p_search    text     default null,
  p_limit     integer  default 20,
  p_offset    integer  default 0
)
returns table (
  id             uuid,
  course_id      uuid,
  course_title   text,
  student_id     uuid,
  student_name   text,
  student_class  text,
  student_code   text,
  stars          smallint,
  review         text,
  is_hidden      boolean,
  hidden_at      timestamptz,
  hidden_reason  text,
  hidden_by_name text,
  created_at     timestamptz,
  updated_at     timestamptz,
  total_count    bigint
)
language sql
stable
security invoker
set search_path = ''
as $f$
  with params as (
    select case
             when p_search is null or btrim(p_search) = '' then null
             -- Escape LIKE's wildcards so a search for "50%" means 50%.
             else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pattern
  )
  select r.id,
         r.course_id,
         c.title,
         r.student_id,
         s.full_name,
         s.class,
         s.student_code,
         r.stars,
         r.review,
         r.is_hidden,
         r.hidden_at,
         r.hidden_reason,
         r.hidden_by_name,
         r.created_at,
         r.updated_at,
         count(*) over ()
    from public.course_ratings r
    cross join params
    join public.students s          on s.id  = r.student_id
    left join public.courses c      on c.id  = r.course_id
   where (p_course_id is null or r.course_id = p_course_id)
     and (p_status is null
          or (p_status = 'hidden'  and r.is_hidden)
          or (p_status = 'visible' and not r.is_hidden))
     and (p_stars is null or r.stars = p_stars)
     and (
       params.pattern is null
       or r.review    ilike params.pattern
       or s.full_name ilike params.pattern
       or c.title     ilike params.pattern
     )
   order by r.updated_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$f$;

revoke execute on function public.admin_list_course_ratings(uuid, text, smallint, text, integer, integer) from public, anon;
grant  execute on function public.admin_list_course_ratings(uuid, text, smallint, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Bring every course's numbers in line with the new rule.
-- ---------------------------------------------------------------------------
select public.recompute_course_rating(c.id) from public.courses c;
