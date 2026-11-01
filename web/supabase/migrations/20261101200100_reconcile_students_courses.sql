-- ---------------------------------------------------------------------------
-- Reconcile `students` and `courses` with the columns the application expects.
--
-- The "Option C" migrations (20261016200000, 20261017100000) dropped both
-- tables and recreated them with a different design, but the admin panel was
-- written against the original schema. Two columns were lost, and each broke a
-- whole admin page:
--
--   students.status    — the admin student list selects and filters on it, and
--                        updateStudentStatus writes it. Without the column
--                        PostgREST rejects the whole select, so /admin/students
--                        showed "No students found" while the dashboard counted
--                        one, because the dashboard goes through a
--                        SECURITY DEFINER RPC that never touches the column.
--                        The recreated table has `is_active boolean`, which no
--                        application code references.
--
--   courses.category_id — /admin/content embeds course_categories. With no FK
--                        PostgREST cannot resolve the relationship and fails
--                        the request, which getCourses swallowed into an empty
--                        list: "No courses yet" despite a published course.
--
-- Both are additive, so no data is lost and the Option C design is preserved.
-- ---------------------------------------------------------------------------

-- `student_status` ('active' | 'inactive' | 'blocked') already exists from the
-- initial schema; the table recreation simply stopped using it.
alter table public.students
  add column if not exists status public.student_status not null default 'active';

-- Carry across whatever state is_active was holding, for rows that predate the
-- new column. Anything already non-default is left alone.
update public.students
   set status = case when coalesce(is_active, true) then 'active'::public.student_status
                     else 'inactive'::public.student_status end
 where status = 'active'
   and coalesce(is_active, true) = false;

create index if not exists idx_students_status on public.students(status);

-- Restore the category relationship the content pages rely on.
alter table public.courses
  add column if not exists category_id uuid references public.course_categories(id) on delete set null;

create index if not exists idx_courses_category_id on public.courses(category_id);
