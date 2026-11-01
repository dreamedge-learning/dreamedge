-- ---------------------------------------------------------------------------
-- Restore NOT NULL on students.user_id and students.email.
--
-- These were dropped by accident, not by decision. An earlier draft of
-- 20261101240000 loosened both so a lead with no login could be inserted as a
-- student; that trade was declined. The draft had already been pushed and
-- failed partway -- the DDL statements committed and only the bookkeeping
-- INSERT into schema_migrations hit a duplicate version -- so the constraints
-- came off the live database while the migration itself was never recorded.
-- Nothing in the repository described the state the database was actually in.
--
-- The constraints matter because every student-facing RLS policy resolves
-- access through user_id. A row without one is invisible to the person it
-- describes and unreachable by the policies meant to protect it, and nothing
-- would stop such rows accumulating unnoticed.
--
-- If this fails with "column contains null values", a student row was created
-- while the constraint was off. Find them before re-running -- they are rows
-- that no login can reach:
--
--   select id, full_name, phone, email, created_at
--     from students where user_id is null or email is null;
--
-- Decide each one deliberately: attach the right auth user, or delete it.
-- Do not work around this by leaving the constraint off.
-- ---------------------------------------------------------------------------

alter table public.students alter column user_id set not null;
alter table public.students alter column email   set not null;
