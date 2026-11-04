-- ============================================================================
-- 20261104184506_course_ratings.sql
-- A 1-5 stars-only rating, one row per (student, course), writeable only by
-- the student who owns an active, unexpired enrolment for that course.
--
-- Prior state: courses.rating_avg and courses.rating_count were read in nine
-- places on the student site (home carousel, catalogue, catalogue
-- sort-by-rating, course detail), yet nothing anywhere wrote them. The
-- columns stayed at their DEFAULT 0 forever, so sorting by rating never
-- reordered anything and every course rendered "no rating". This migration
-- adds the store, the guard rails and the aggregate.
--
-- Scope: no written review text anywhere. Stars only. That decision is
-- enforced by the shape of the table, not a validator somewhere else.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
-- The composite primary key is deliberate: one rating per student per course.
-- It lets the server action UPSERT on (student_id, course_id) without an
-- extra lookup, and it makes "accidentally two rows for one student" a
-- schema violation rather than a race condition.
create table if not exists public.course_ratings (
  student_id uuid not null references public.students(id) on delete cascade,
  course_id  uuid not null references public.courses(id)  on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

-- A per-course index speeds up the aggregate recomputation, which averages
-- every row for one course on each write.
create index if not exists course_ratings_course_id_idx
  on public.course_ratings (course_id);

comment on table public.course_ratings is
  'One 1-5 star rating per (student, course). No written reviews by design.';

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
-- Students may SELECT, INSERT and UPDATE only their own rows, and only for a
-- course where they hold an active, unexpired enrolment. No DELETE for
-- students: a course they bought and watched should keep its mark on the
-- aggregate even if they drop off, and an accidental tap should be an UPDATE
-- away from fixed, not vanished.
--
-- Admins (is_admin()) may SELECT everything, for moderation. No admin-side
-- UPDATE path: a rating is a student artefact, and an admin editing one in
-- place would be indistinguishable from the student's own voice.
alter table public.course_ratings enable row level security;

drop policy if exists course_ratings_select_own on public.course_ratings;
create policy course_ratings_select_own
  on public.course_ratings for select
  to authenticated
  using (student_id = public.current_student_id());

drop policy if exists course_ratings_select_admin on public.course_ratings;
create policy course_ratings_select_admin
  on public.course_ratings for select
  to authenticated
  using (public.is_admin());

drop policy if exists course_ratings_insert_own on public.course_ratings;
create policy course_ratings_insert_own
  on public.course_ratings for insert
  to authenticated
  with check (
    student_id = public.current_student_id()
    and exists (
      select 1
        from public.enrollments en
       where en.student_id = public.current_student_id()
         and en.course_id  = course_ratings.course_id
         and en.status     = 'active'
         and (en.valid_until is null or en.valid_until > now())
    )
  );

drop policy if exists course_ratings_update_own on public.course_ratings;
create policy course_ratings_update_own
  on public.course_ratings for update
  to authenticated
  using (student_id = public.current_student_id())
  with check (
    student_id = public.current_student_id()
    and exists (
      select 1
        from public.enrollments en
       where en.student_id = public.current_student_id()
         and en.course_id  = course_ratings.course_id
         and en.status     = 'active'
         and (en.valid_until is null or en.valid_until > now())
    )
  );

-- service_role bypasses RLS, so no explicit policy is needed for Edge
-- Functions. No DELETE policy for students, deliberately.

-- ----------------------------------------------------------------------------
-- 3. updated_at maintenance
-- ----------------------------------------------------------------------------
-- A plain BEFORE UPDATE trigger that stamps updated_at. Not SECURITY DEFINER:
-- it only touches the row being written and runs as the caller.
create or replace function public.course_ratings_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists course_ratings_updated_at on public.course_ratings;
create trigger course_ratings_updated_at
  before update on public.course_ratings
  for each row
  execute function public.course_ratings_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Aggregate recomputation
-- ----------------------------------------------------------------------------
-- The trigger writes courses.rating_avg and courses.rating_count. Students
-- cannot update courses (see courses_select_published / courses_service_all),
-- so the function MUST be SECURITY DEFINER or every rating insert fails at
-- RLS. It is kept deliberately narrow: it writes exactly those two columns on
-- exactly one courses row, and nothing else. `set search_path = public,
-- pg_temp` is the standard definer hardening.
--
-- rating_avg is rounded to one decimal to match the NUMERIC(2,1) column.
-- When the last rating for a course disappears, rating_count is zero and
-- rating_avg is null -- "no rating yet" is distinct from "zero stars".
create or replace function public.recompute_course_rating(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_avg   numeric(2,1);
begin
  select count(*)::int,
         round(avg(stars)::numeric, 1)
    into v_count, v_avg
    from public.course_ratings
   where course_id = p_course_id;

  update public.courses
     set rating_count = v_count,
         rating_avg   = case when v_count = 0 then null else v_avg end
   where id = p_course_id;
end;
$$;

revoke execute on function public.recompute_course_rating(uuid) from public, anon, authenticated;
-- No explicit grant: the function is only ever called by the trigger below,
-- which carries its own SECURITY DEFINER rights.

create or replace function public.course_ratings_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_course_rating(old.course_id);
    return old;
  end if;

  perform public.recompute_course_rating(new.course_id);
  -- An UPDATE that moves a rating between courses is not a path the RLS
  -- policies allow (the row's primary key is (student_id, course_id), and
  -- students cannot write another student's row), but recomputing the old
  -- course too is cheap and keeps the function correct if that ever changes.
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    perform public.recompute_course_rating(old.course_id);
  end if;

  return new;
end;
$$;

drop trigger if exists course_ratings_aggregate_ins on public.course_ratings;
create trigger course_ratings_aggregate_ins
  after insert on public.course_ratings
  for each row
  execute function public.course_ratings_aggregate();

drop trigger if exists course_ratings_aggregate_upd on public.course_ratings;
create trigger course_ratings_aggregate_upd
  after update on public.course_ratings
  for each row
  execute function public.course_ratings_aggregate();

drop trigger if exists course_ratings_aggregate_del on public.course_ratings;
create trigger course_ratings_aggregate_del
  after delete on public.course_ratings
  for each row
  execute function public.course_ratings_aggregate();

-- ----------------------------------------------------------------------------
-- 5. Column defaults and backfill
-- ----------------------------------------------------------------------------
-- The DEFAULT on rating_avg was 0, so every existing course reads back as
-- "0.0 stars". Switch the default to null and backfill every course that has
-- no ratings so the display path can finally distinguish "nobody has rated
-- this yet" from "everyone gave it zero stars".
alter table public.courses alter column rating_avg drop default;

update public.courses c
   set rating_count = coalesce(agg.n, 0),
       rating_avg   = agg.avg
  from (
    select c2.id as course_id,
           count(r.*)::int as n,
           round(avg(r.stars)::numeric, 1) as avg
      from public.courses c2
      left join public.course_ratings r on r.course_id = c2.id
     group by c2.id
  ) agg
 where c.id = agg.course_id
   and (c.rating_count is distinct from coalesce(agg.n, 0)
        or c.rating_avg   is distinct from agg.avg);
