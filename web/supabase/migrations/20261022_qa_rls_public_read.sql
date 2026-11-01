-- Allow anonymous and authenticated users to read PUBLISHED courses only.
-- (Draft/archived courses stay invisible to the mobile app and website.)
alter table public.courses enable row level security;

drop policy if exists "courses_public_read_published" on public.courses;
create policy "courses_public_read_published"
  on public.courses
  for select
  to anon, authenticated
  using (is_published = true);

-- Students can read their own student profile (the mobile app's /me lookup).
alter table public.students enable row level security;

drop policy if exists "students_self_read" on public.students;
create policy "students_self_read"
  on public.students
  for select
  to authenticated
  using (user_id = auth.uid());

-- Students can read their own enrollments and orders (used by "My Learning",
-- course player gating, and payment history).
alter table public.enrollments enable row level security;

drop policy if exists "enrollments_self_read" on public.enrollments;
create policy "enrollments_self_read"
  on public.enrollments
  for select
  to authenticated
  using (
    student_id in (select id from public.students where user_id = auth.uid())
  );

alter table public.orders enable row level security;

drop policy if exists "orders_self_read" on public.orders;
create policy "orders_self_read"
  on public.orders
  for select
  to authenticated
  using (
    student_id in (select id from public.students where user_id = auth.uid())
  );
