
-- `student_id` is filled by the server (see 20261105104548), so the column
-- says so too. The default matches what the insert trigger writes, and it is
-- what lets clients and the generated types leave the column out of an
-- insert entirely.
alter table public.student_feedback
  alter column student_id set default public.current_student_id();
