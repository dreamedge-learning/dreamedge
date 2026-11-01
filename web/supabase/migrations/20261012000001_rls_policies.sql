-- Dream Edge Online — Row Level Security Policies
-- Run AFTER initial schema migration

-- ============================================
-- HELPER: Check if current user is an admin with a specific role
-- ============================================
create or replace function public.get_admin_role()
returns user_role as $$
  select r.name
  from admin_users au
  join roles r on r.id = au.role_id
  where au.user_id = auth.uid()
    and au.is_active = true
  limit 1;
$$ language sql security definer stable;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
      and is_active = true
  );
$$ language sql security definer stable;

create or replace function public.is_super_admin()
returns boolean as $$
  select public.get_admin_role() = 'super_admin';
$$ language sql security definer stable;

create or replace function public.has_admin_role(allowed_roles user_role[])
returns boolean as $$
  select public.get_admin_role() = any(allowed_roles);
$$ language sql security definer stable;

-- Helper: get student id for current user
create or replace function public.get_student_id()
returns uuid as $$
  select id from students where user_id = auth.uid() limit 1;
$$ language sql security definer stable;


-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
alter table roles enable row level security;
alter table admin_users enable row level security;
alter table course_categories enable row level security;
alter table courses enable row level security;
alter table subjects enable row level security;
alter table topics enable row level security;
alter table content_items enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table question_bank enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table student_progress enable row level security;
alter table test_attempts enable row level security;
alter table orders enable row level security;
alter table refunds enable row level security;
alter table live_classes enable row level security;
alter table notifications enable row level security;
alter table student_notifications enable row level security;
alter table leads enable row level security;
alter table referral_codes enable row level security;
alter table banners enable row level security;
alter table testimonials enable row level security;
alter table batches enable row level security;
alter table batch_students enable row level security;
alter table audit_log enable row level security;


-- ============================================
-- ROLES TABLE
-- ============================================
-- Admins can read roles
create policy "Admins can view roles"
  on roles for select
  using (public.is_admin());


-- ============================================
-- ADMIN USERS TABLE
-- ============================================
-- Super admin: full CRUD
create policy "Super admin full access to admin_users"
  on admin_users for all
  using (public.is_super_admin());

-- Other admins: read only
create policy "Admins can view other admins"
  on admin_users for select
  using (public.is_admin());


-- ============================================
-- COURSE CATEGORIES — public read, admin write
-- ============================================
create policy "Anyone can view visible categories"
  on course_categories for select
  using (is_visible = true);

create policy "Admins can view all categories"
  on course_categories for select
  using (public.is_admin());

create policy "Admins can manage categories"
  on course_categories for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- COURSES — published courses are public, admin write
-- ============================================
create policy "Anyone can view published courses"
  on courses for select
  using (status = 'published');

create policy "Admins can view all courses"
  on courses for select
  using (public.is_admin());

create policy "Content admins can manage courses"
  on courses for insert
  with check (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));

create policy "Content admins can update courses"
  on courses for update
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));

create policy "Super admin can delete courses"
  on courses for delete
  using (public.is_super_admin());


-- ============================================
-- SUBJECTS — same pattern as courses
-- ============================================
create policy "Anyone can view visible subjects"
  on subjects for select
  using (is_visible = true);

create policy "Admins can view all subjects"
  on subjects for select
  using (public.is_admin());

create policy "Content admins can manage subjects"
  on subjects for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- TOPICS — same pattern
-- ============================================
create policy "Anyone can view visible topics"
  on topics for select
  using (is_visible = true);

create policy "Admins can view all topics"
  on topics for select
  using (public.is_admin());

create policy "Content admins can manage topics"
  on topics for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- CONTENT ITEMS — enrolled students see paid, anyone sees free
-- ============================================
create policy "Anyone can view free published content"
  on content_items for select
  using (status = 'published' and is_paid = false);

create policy "Enrolled students can view paid content"
  on content_items for select
  using (
    status = 'published'
    and is_paid = true
    and exists (
      select 1 from enrollments e
      join topics t on t.id = content_items.topic_id
      join subjects s on s.id = t.subject_id
      where e.student_id = public.get_student_id()
        and e.course_id = s.course_id
        and e.status = 'active'
        and e.valid_until > now()
    )
  );

create policy "Admins can view all content"
  on content_items for select
  using (public.is_admin());

create policy "Content admins can manage content"
  on content_items for insert
  with check (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));

create policy "Content admins can update content"
  on content_items for update
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));

create policy "Super admin can delete content"
  on content_items for delete
  using (public.is_super_admin());


-- ============================================
-- TESTS — enrolled students + admins
-- ============================================
create policy "Published tests visible to enrolled students"
  on tests for select
  using (
    status = 'published'
    and (
      course_id is null
      or exists (
        select 1 from enrollments e
        where e.student_id = public.get_student_id()
          and e.course_id = tests.course_id
          and e.status = 'active'
          and e.valid_until > now()
      )
    )
  );

create policy "Admins can view all tests"
  on tests for select
  using (public.is_admin());

create policy "Content admins can manage tests"
  on tests for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- QUESTIONS — only visible through tests (enrolled students)
-- ============================================
create policy "Students see questions for accessible tests"
  on questions for select
  using (
    exists (
      select 1 from tests t
      where t.id = questions.test_id
        and t.status = 'published'
        and (
          t.course_id is null
          or exists (
            select 1 from enrollments e
            where e.student_id = public.get_student_id()
              and e.course_id = t.course_id
              and e.status = 'active'
              and e.valid_until > now()
          )
        )
    )
  );

create policy "Admins can view all questions"
  on questions for select
  using (public.is_admin());

create policy "Content admins can manage questions"
  on questions for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- QUESTION BANK — admin only
-- ============================================
create policy "Admins can view question bank"
  on question_bank for select
  using (public.is_admin());

create policy "Content admins can manage question bank"
  on question_bank for all
  using (public.has_admin_role(array['super_admin', 'content_creator']::user_role[]));


-- ============================================
-- STUDENTS — own data + admins
-- ============================================
create policy "Students can view own profile"
  on students for select
  using (user_id = auth.uid());

create policy "Students can update own profile"
  on students for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins can view all students"
  on students for select
  using (public.is_admin());

create policy "Admins can manage students"
  on students for all
  using (public.has_admin_role(array['super_admin', 'support_staff']::user_role[]));

-- Allow new student row creation on signup (via service role or trigger)
create policy "New users can create own student profile"
  on students for insert
  with check (user_id = auth.uid());


-- ============================================
-- ENROLLMENTS — own data + admins
-- ============================================
create policy "Students can view own enrollments"
  on enrollments for select
  using (student_id = public.get_student_id());

create policy "Admins can view all enrollments"
  on enrollments for select
  using (public.is_admin());

create policy "Admins can manage enrollments"
  on enrollments for all
  using (public.has_admin_role(array['super_admin', 'accountant']::user_role[]));


-- ============================================
-- STUDENT PROGRESS — own data + admins
-- ============================================
create policy "Students can view own progress"
  on student_progress for select
  using (student_id = public.get_student_id());

create policy "Students can update own progress"
  on student_progress for insert
  with check (student_id = public.get_student_id());

create policy "Students can modify own progress"
  on student_progress for update
  using (student_id = public.get_student_id());

create policy "Admins can view all progress"
  on student_progress for select
  using (public.is_admin());


-- ============================================
-- TEST ATTEMPTS — own data + admins
-- ============================================
create policy "Students can view own attempts"
  on test_attempts for select
  using (student_id = public.get_student_id());

create policy "Students can submit attempts"
  on test_attempts for insert
  with check (student_id = public.get_student_id());

create policy "Admins can view all attempts"
  on test_attempts for select
  using (public.is_admin());


-- ============================================
-- ORDERS — own data + finance admins
-- ============================================
create policy "Students can view own orders"
  on orders for select
  using (student_id = public.get_student_id());

create policy "Finance admins can view all orders"
  on orders for select
  using (public.has_admin_role(array['super_admin', 'accountant']::user_role[]));

create policy "Finance admins can manage orders"
  on orders for all
  using (public.has_admin_role(array['super_admin', 'accountant']::user_role[]));


-- ============================================
-- REFUNDS — finance admins only
-- ============================================
create policy "Students can view own refunds"
  on refunds for select
  using (
    exists (
      select 1 from orders o
      where o.id = refunds.order_id
        and o.student_id = public.get_student_id()
    )
  );

create policy "Finance admins can manage refunds"
  on refunds for all
  using (public.has_admin_role(array['super_admin', 'accountant']::user_role[]));


-- ============================================
-- LIVE CLASSES — enrolled students + admins
-- ============================================
create policy "Enrolled students can view scheduled live classes"
  on live_classes for select
  using (
    status in ('scheduled', 'live')
    and exists (
      select 1 from enrollments e
      where e.student_id = public.get_student_id()
        and e.course_id = live_classes.course_id
        and e.status = 'active'
        and e.valid_until > now()
    )
  );

create policy "Admins can view all live classes"
  on live_classes for select
  using (public.is_admin());

create policy "Teachers and admins can manage live classes"
  on live_classes for all
  using (public.has_admin_role(array['super_admin', 'content_creator', 'teacher']::user_role[]));


-- ============================================
-- NOTIFICATIONS — targeted delivery
-- ============================================
create policy "Admins can manage notifications"
  on notifications for all
  using (public.is_admin());

-- Student notifications junction
create policy "Students can view own notifications"
  on student_notifications for select
  using (student_id = public.get_student_id());

create policy "Students can mark own notifications read"
  on student_notifications for update
  using (student_id = public.get_student_id())
  with check (student_id = public.get_student_id());

create policy "Admins can manage student notifications"
  on student_notifications for all
  using (public.is_admin());


-- ============================================
-- LEADS — support + admin
-- ============================================
create policy "Support admins can manage leads"
  on leads for all
  using (public.has_admin_role(array['super_admin', 'support_staff']::user_role[]));


-- ============================================
-- REFERRAL CODES — public read (active only), admin write
-- ============================================
create policy "Anyone can validate active referral codes"
  on referral_codes for select
  using (is_active = true and (valid_until is null or valid_until > now()));

create policy "Admins can manage referral codes"
  on referral_codes for all
  using (public.has_admin_role(array['super_admin', 'accountant']::user_role[]));


-- ============================================
-- BANNERS — public read (active), admin write
-- ============================================
create policy "Anyone can view active banners"
  on banners for select
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

create policy "Admins can manage banners"
  on banners for all
  using (public.has_admin_role(array['super_admin', 'support_staff']::user_role[]));


-- ============================================
-- TESTIMONIALS — public read (visible), admin write
-- ============================================
create policy "Anyone can view visible testimonials"
  on testimonials for select
  using (is_visible = true);

create policy "Admins can manage testimonials"
  on testimonials for all
  using (public.has_admin_role(array['super_admin', 'support_staff']::user_role[]));


-- ============================================
-- BATCHES — future, admin only for now
-- ============================================
create policy "Admins can manage batches"
  on batches for all
  using (public.is_admin());

create policy "Admins can manage batch students"
  on batch_students for all
  using (public.is_admin());


-- ============================================
-- AUDIT LOG — super admin + technical only
-- ============================================
create policy "Technical admins can view audit log"
  on audit_log for select
  using (public.has_admin_role(array['super_admin', 'technical']::user_role[]));

-- Insert allowed for all admins (logging their own actions)
create policy "Admins can write to audit log"
  on audit_log for insert
  with check (public.is_admin());


-- ============================================
-- DONE! All RLS policies applied.
-- ============================================
