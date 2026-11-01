-- ---------------------------------------------------------------------------
-- Finish reconciling `students`, and make lead conversion possible.
--
-- A follow-up to 20261101210000, from an audit of the remaining "Option C"
-- table rebuilds. Two more columns turned out to have been lost, plus three
-- constraints that made "Convert to student" impossible by construction.
--
--   board, wallet_balance — both existed in the initial schema and were
--     dropped by the students rebuild, but fetchStudentDetail still selects
--     them. PostgREST rejects the whole select with 42703, so clicking any
--     student in /admin/students opened a completely blank drawer: no
--     profile, no courses, no tests, no orders. The toast said only
--     "Something went wrong", with the real cause in the server log.
--
--   user_id — references auth.users, so a converted lead (who has no login
--     yet) could never be inserted; the action passed a random uuid and
--     always failed with 23503. A lead becomes a student record first and
--     signs up later, so the link is now optional and gets filled in when
--     they register.
--
--   email — the rebuild made this NOT NULL, but leads may be phone-only.
--
--   students_staff_insert — even with the above fixed, the only INSERT policy
--     was `user_id = auth.uid()`, which an admin creating someone else's row
--     can never satisfy. Without this policy the conversion would simply have
--     failed again, one layer further down.
--
-- Nullable columns keep their UNIQUE constraints: Postgres allows many NULLs
-- in a unique index, so unregistered students do not collide.
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists board text,
  add column if not exists wallet_balance numeric(10,2) not null default 0.00;

alter table public.students alter column user_id drop not null;
alter table public.students alter column email   drop not null;

drop policy if exists students_staff_insert on public.students;
create policy students_staff_insert
  on public.students for insert
  to authenticated
  with check (public.has_admin_role(
    array['super_admin','support_staff']::user_role[]));
