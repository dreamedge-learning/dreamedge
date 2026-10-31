-- ============================================================================
-- 20261030000000_rls_role_model.sql
-- Pushes the six-role model from application code down into the database.
--
-- CONTEXT
--   Prior state: RLS was enabled on only 8 of 29 tables. The other 21 were fully
--   open to any holder of the anon key. 20261012000001_rls_policies.sql aborted
--   at line 124 on `FOR INSERT ... USING (...)`, which is invalid PostgreSQL --
--   INSERT policies accept only WITH CHECK. Every policy declared after that
--   line was therefore never created, and has_admin_role()/get_admin_role()
--   never existed in the live database.
--
--   The admin panel executes as the `authenticated` role (lib/supabase/server.ts
--   builds its client from the anon key plus session cookies), NOT service_role.
--   Consequently every admin table needs an explicit admin policy, or enabling
--   RLS locks the panel out of its own data.
--
-- ORDERING IS LOAD-BEARING
--   admin_users and roles are secured FIRST, with a self-read policy, because
--   assertAdmin() reads admin_users joined to roles on every single request.
--   Without that self-read, all five non-super-admin roles lose panel access.
--
-- SAFETY
--   service_role bypasses RLS entirely, so Edge Functions and complete_paid_order
--   are unaffected by anything in this file.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. MISSING HELPERS
--    is_admin(), is_super_admin() and current_student_id() already exist and are
--    correctly SECURITY DEFINER. These two were lost with the aborted migration.
-- ----------------------------------------------------------------------------

create or replace function public.get_admin_role()
returns user_role
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select r.name
    from public.admin_users au
    join public.roles r on r.id = au.role_id
   where au.user_id = auth.uid()
     and coalesce(au.is_active, true) = true
   limit 1;
$$;

create or replace function public.has_admin_role(p_roles user_role[])
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.admin_users au
      join public.roles r on r.id = au.role_id
     where au.user_id = auth.uid()
       and coalesce(au.is_active, true) = true
       and r.name = any(p_roles)
  );
$$;

revoke execute on function public.get_admin_role() from public, anon;
revoke execute on function public.has_admin_role(user_role[]) from public, anon;
grant  execute on function public.get_admin_role() to authenticated;
grant  execute on function public.has_admin_role(user_role[]) to authenticated;

-- Student ownership helper, mirrored for readability in policies below.
-- (current_student_id() already exists as SECURITY DEFINER.)

-- ----------------------------------------------------------------------------
-- 2. AUTH PATH — admin_users + roles
--    Must come first. assertAdmin() depends on both.
-- ----------------------------------------------------------------------------

alter table public.admin_users enable row level security;

-- Every admin must be able to read their OWN row or authentication breaks.
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- Team management: super_admin sees and edits all; technical may read the roster.
drop policy if exists admin_users_roster_read on public.admin_users;
create policy admin_users_roster_read
  on public.admin_users for select
  to authenticated
  using (public.has_admin_role(array['super_admin','technical']::user_role[]));

drop policy if exists admin_users_super_insert on public.admin_users;
create policy admin_users_super_insert
  on public.admin_users for insert
  to authenticated
  with check (public.is_super_admin());

drop policy if exists admin_users_super_update on public.admin_users;
create policy admin_users_super_update
  on public.admin_users for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists admin_users_super_delete on public.admin_users;
create policy admin_users_super_delete
  on public.admin_users for delete
  to authenticated
  using (public.is_super_admin());

-- The pre-existing policy targeted {public}, which includes anon. Replaced above
-- with authenticated-scoped equivalents.
drop policy if exists admin_users_super_admin_all on public.admin_users;

alter table public.roles enable row level security;

-- assertAdmin() joins roles(name): all active admins need SELECT.
drop policy if exists roles_admin_read on public.roles;
create policy roles_admin_read
  on public.roles for select
  to authenticated
  using (public.is_admin());

drop policy if exists roles_super_write on public.roles;
create policy roles_super_write
  on public.roles for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 3. CATALOG — course_categories, subjects, topics
--    Publicly readable (the marketing site renders them for logged-out visitors).
--    Written by super_admin + content_creator. Deleted by super_admin only.
-- ----------------------------------------------------------------------------

alter table public.course_categories enable row level security;

drop policy if exists categories_public_read on public.course_categories;
create policy categories_public_read
  on public.course_categories for select
  to anon, authenticated
  using (is_visible = true or public.is_admin());

drop policy if exists categories_content_insert on public.course_categories;
create policy categories_content_insert
  on public.course_categories for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists categories_content_update on public.course_categories;
create policy categories_content_update
  on public.course_categories for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists categories_super_delete on public.course_categories;
create policy categories_super_delete
  on public.course_categories for delete
  to authenticated
  using (public.is_super_admin());

alter table public.subjects enable row level security;

drop policy if exists subjects_public_read on public.subjects;
create policy subjects_public_read
  on public.subjects for select
  to anon, authenticated
  using (is_visible = true or public.is_admin());

drop policy if exists subjects_content_insert on public.subjects;
create policy subjects_content_insert
  on public.subjects for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists subjects_content_update on public.subjects;
create policy subjects_content_update
  on public.subjects for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists subjects_super_delete on public.subjects;
create policy subjects_super_delete
  on public.subjects for delete
  to authenticated
  using (public.is_super_admin());

alter table public.topics enable row level security;

drop policy if exists topics_public_read on public.topics;
create policy topics_public_read
  on public.topics for select
  to anon, authenticated
  using (is_visible = true or public.is_admin());

drop policy if exists topics_content_insert on public.topics;
create policy topics_content_insert
  on public.topics for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists topics_content_update on public.topics;
create policy topics_content_update
  on public.topics for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists topics_super_delete on public.topics;
create policy topics_super_delete
  on public.topics for delete
  to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 4. COURSES — admin write policies. Existing public-read policies are left in
--    place deliberately; see the NOTE at the foot of this file about the
--    status / is_published duplication, which is a schema problem, not an
--    access-control one, and is handled separately.
-- ----------------------------------------------------------------------------

drop policy if exists courses_admin_read on public.courses;
create policy courses_admin_read
  on public.courses for select
  to authenticated
  using (public.is_admin());

drop policy if exists courses_content_insert on public.courses;
create policy courses_content_insert
  on public.courses for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists courses_content_update on public.courses;
create policy courses_content_update
  on public.courses for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

-- Spec: content_creator explicitly CANNOT delete courses.
drop policy if exists courses_super_delete on public.courses;
create policy courses_super_delete
  on public.courses for delete
  to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 5. CONTENT_ITEMS — the paywall, enforced in SQL rather than the UI.
--    Free published items are public. Paid items require an active enrolment in
--    the owning course, resolved topic -> subject -> course -> enrolment.
-- ----------------------------------------------------------------------------

alter table public.content_items enable row level security;

drop policy if exists content_items_free_read on public.content_items;
create policy content_items_free_read
  on public.content_items for select
  to anon, authenticated
  using (is_paid = false and status = 'published');

drop policy if exists content_items_enrolled_read on public.content_items;
create policy content_items_enrolled_read
  on public.content_items for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
        from public.topics t
        join public.subjects s   on s.id = t.subject_id
        join public.enrollments e on e.course_id = s.course_id
        join public.students st  on st.id = e.student_id
       where t.id = content_items.topic_id
         and st.user_id = auth.uid()
         and e.status = 'active'
         and (e.valid_until is null or e.valid_until > now())
    )
  );

drop policy if exists content_items_admin_read on public.content_items;
create policy content_items_admin_read
  on public.content_items for select
  to authenticated
  using (public.is_admin());

drop policy if exists content_items_content_insert on public.content_items;
create policy content_items_content_insert
  on public.content_items for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists content_items_content_update on public.content_items;
create policy content_items_content_update
  on public.content_items for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists content_items_super_delete on public.content_items;
create policy content_items_super_delete
  on public.content_items for delete
  to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 6. ASSESSMENT — tests, questions, question_bank
--
--    EXAM INTEGRITY: students get NO direct SELECT on `questions`. RLS is
--    row-level, not column-level, so any student-readable policy would also
--    expose correct_answer, explanation and hint. Question delivery must go
--    through a SECURITY DEFINER RPC that strips the answer key, built alongside
--    the test-taking UI. Until then, questions are admin-only.
--
--    This breaks mobile/lib/core/services/test_service.dart:58, which selects
--    questions.* directly. That path is already unreachable -- TestListScreen is
--    routed nowhere and /tests/:id/run does not exist -- so there is no
--    functional regression.
-- ----------------------------------------------------------------------------

alter table public.tests enable row level security;

drop policy if exists tests_enrolled_read on public.tests;
create policy tests_enrolled_read
  on public.tests for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
        from public.enrollments e
        join public.students st on st.id = e.student_id
       where e.course_id = tests.course_id
         and st.user_id = auth.uid()
         and e.status = 'active'
         and (e.valid_until is null or e.valid_until > now())
    )
  );

drop policy if exists tests_admin_read on public.tests;
create policy tests_admin_read
  on public.tests for select
  to authenticated
  using (public.is_admin());

drop policy if exists tests_content_insert on public.tests;
create policy tests_content_insert
  on public.tests for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists tests_content_update on public.tests;
create policy tests_content_update
  on public.tests for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists tests_super_delete on public.tests;
create policy tests_super_delete
  on public.tests for delete
  to authenticated
  using (public.is_super_admin());

alter table public.questions enable row level security;

drop policy if exists questions_admin_read on public.questions;
create policy questions_admin_read
  on public.questions for select
  to authenticated
  using (public.is_admin());

drop policy if exists questions_content_insert on public.questions;
create policy questions_content_insert
  on public.questions for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists questions_content_update on public.questions;
create policy questions_content_update
  on public.questions for update
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

drop policy if exists questions_content_delete on public.questions;
create policy questions_content_delete
  on public.questions for delete
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

alter table public.question_bank enable row level security;

drop policy if exists question_bank_admin_read on public.question_bank;
create policy question_bank_admin_read
  on public.question_bank for select
  to authenticated
  using (public.is_admin());

drop policy if exists question_bank_content_write on public.question_bank;
create policy question_bank_content_write
  on public.question_bank for all
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

-- ----------------------------------------------------------------------------
-- 7. TEST ATTEMPTS
--    Students may READ their own attempts but may NOT write them: grading is a
--    server-side concern. mobile test_service.dart:104-150 currently computes
--    score on the device and inserts it, which lets a student post any mark.
--    That insert path is intentionally closed here; scoring moves to an RPC.
-- ----------------------------------------------------------------------------

alter table public.test_attempts enable row level security;

drop policy if exists attempts_self_read on public.test_attempts;
create policy attempts_self_read
  on public.test_attempts for select
  to authenticated
  using (student_id = public.current_student_id());

drop policy if exists attempts_staff_read on public.test_attempts;
create policy attempts_staff_read
  on public.test_attempts for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','teacher','content_creator','support_staff']::user_role[]));

-- ----------------------------------------------------------------------------
-- 8. STUDENT RECORDS — admin visibility.
--    students / enrollments / student_progress already carry correct self-read
--    policies but have NO admin policy, so the panel (which runs as
--    `authenticated`) currently sees zero rows in every one of them. These
--    policies repair that.
-- ----------------------------------------------------------------------------

drop policy if exists students_staff_read on public.students;
create policy students_staff_read
  on public.students for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','support_staff','teacher','content_creator','accountant']::user_role[]));

drop policy if exists students_staff_update on public.students;
create policy students_staff_update
  on public.students for update
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

drop policy if exists enrollments_staff_read on public.enrollments;
create policy enrollments_staff_read
  on public.enrollments for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','support_staff','teacher','content_creator','accountant']::user_role[]));

drop policy if exists enrollments_staff_write on public.enrollments;
create policy enrollments_staff_write
  on public.enrollments for all
  to authenticated
  using (public.has_admin_role(array['super_admin','accountant']::user_role[]))
  with check (public.has_admin_role(array['super_admin','accountant']::user_role[]));

-- Remove the exact duplicate of enrollments_select_own.
drop policy if exists enrollments_select_own on public.enrollments;

drop policy if exists progress_staff_read on public.student_progress;
create policy progress_staff_read
  on public.student_progress for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','teacher','content_creator','support_staff']::user_role[]));

drop policy if exists progress_self_write on public.student_progress;
create policy progress_self_write
  on public.student_progress for insert
  to authenticated
  with check (student_id = public.current_student_id());

drop policy if exists progress_self_update on public.student_progress;
create policy progress_self_update
  on public.student_progress for update
  to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

-- ----------------------------------------------------------------------------
-- 9. MONEY — orders, refunds, referral_codes
--    Spec: accountant owns this area; support_staff may read orders only;
--    content_creator and teacher are excluded entirely.
-- ----------------------------------------------------------------------------

drop policy if exists orders_finance_read on public.orders;
create policy orders_finance_read
  on public.orders for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','accountant','support_staff']::user_role[]));

drop policy if exists orders_finance_write on public.orders;
create policy orders_finance_write
  on public.orders for all
  to authenticated
  using (public.has_admin_role(array['super_admin','accountant']::user_role[]))
  with check (public.has_admin_role(array['super_admin','accountant']::user_role[]));

alter table public.refunds enable row level security;

drop policy if exists refunds_finance_read on public.refunds;
create policy refunds_finance_read
  on public.refunds for select
  to authenticated
  using (public.has_admin_role(array['super_admin','accountant']::user_role[]));

drop policy if exists refunds_finance_write on public.refunds;
create policy refunds_finance_write
  on public.refunds for all
  to authenticated
  using (public.has_admin_role(array['super_admin','accountant']::user_role[]))
  with check (public.has_admin_role(array['super_admin','accountant']::user_role[]));

alter table public.referral_codes enable row level security;

drop policy if exists referral_self_read on public.referral_codes;
create policy referral_self_read
  on public.referral_codes for select
  to authenticated
  using (student_id = public.current_student_id());

drop policy if exists referral_finance_read on public.referral_codes;
create policy referral_finance_read
  on public.referral_codes for select
  to authenticated
  using (public.has_admin_role(
    array['super_admin','accountant','support_staff']::user_role[]));

drop policy if exists referral_finance_write on public.referral_codes;
create policy referral_finance_write
  on public.referral_codes for all
  to authenticated
  using (public.has_admin_role(array['super_admin','accountant']::user_role[]))
  with check (public.has_admin_role(array['super_admin','accountant']::user_role[]));

-- ----------------------------------------------------------------------------
-- 10. CRM + ENGAGEMENT — leads, notifications, banners, testimonials
--     Spec: support_staff owns leads, notifications and banners.
-- ----------------------------------------------------------------------------

alter table public.leads enable row level security;

drop policy if exists leads_staff_read on public.leads;
create policy leads_staff_read
  on public.leads for select
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

drop policy if exists leads_staff_write on public.leads;
create policy leads_staff_write
  on public.leads for all
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

alter table public.notifications enable row level security;

drop policy if exists notifications_staff_read on public.notifications;
create policy notifications_staff_read
  on public.notifications for select
  to authenticated
  using (public.is_admin());

drop policy if exists notifications_staff_write on public.notifications;
create policy notifications_staff_write
  on public.notifications for all
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

alter table public.student_notifications enable row level security;

drop policy if exists student_notifications_self_read on public.student_notifications;
create policy student_notifications_self_read
  on public.student_notifications for select
  to authenticated
  using (student_id = public.current_student_id());

-- A student may mark their own notification read, nothing more.
drop policy if exists student_notifications_self_update on public.student_notifications;
create policy student_notifications_self_update
  on public.student_notifications for update
  to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

drop policy if exists student_notifications_staff_read on public.student_notifications;
create policy student_notifications_staff_read
  on public.student_notifications for select
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

alter table public.banners enable row level security;

drop policy if exists banners_public_read on public.banners;
create policy banners_public_read
  on public.banners for select
  to anon, authenticated
  using (
    (is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at   is null or ends_at   >  now()))
    or public.is_admin()
  );

drop policy if exists banners_staff_write on public.banners;
create policy banners_staff_write
  on public.banners for all
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

alter table public.testimonials enable row level security;

drop policy if exists testimonials_public_read on public.testimonials;
create policy testimonials_public_read
  on public.testimonials for select
  to anon, authenticated
  using (is_visible = true or public.is_admin());

drop policy if exists testimonials_staff_write on public.testimonials;
create policy testimonials_staff_write
  on public.testimonials for all
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

-- ----------------------------------------------------------------------------
-- 11. LIVE CLASSES
--     Spec: teacher may go live (status transitions) but may not author content.
-- ----------------------------------------------------------------------------

alter table public.live_classes enable row level security;

drop policy if exists live_classes_enrolled_read on public.live_classes;
create policy live_classes_enrolled_read
  on public.live_classes for select
  to authenticated
  using (
    exists (
      select 1
        from public.enrollments e
        join public.students st on st.id = e.student_id
       where e.course_id = live_classes.course_id
         and st.user_id = auth.uid()
         and e.status = 'active'
         and (e.valid_until is null or e.valid_until > now())
    )
  );

drop policy if exists live_classes_admin_read on public.live_classes;
create policy live_classes_admin_read
  on public.live_classes for select
  to authenticated
  using (public.is_admin());

drop policy if exists live_classes_schedule_insert on public.live_classes;
create policy live_classes_schedule_insert
  on public.live_classes for insert
  to authenticated
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

-- super_admin and content_creator may edit freely; a teacher may update only the
-- class they are assigned to (go live / end class).
drop policy if exists live_classes_update on public.live_classes;
create policy live_classes_update
  on public.live_classes for update
  to authenticated
  using (
    public.has_admin_role(array['super_admin','content_creator']::user_role[])
    or (
      public.has_admin_role(array['teacher']::user_role[])
      and teacher_id in (
        select au.id from public.admin_users au where au.user_id = auth.uid()
      )
    )
  )
  with check (
    public.has_admin_role(array['super_admin','content_creator']::user_role[])
    or (
      public.has_admin_role(array['teacher']::user_role[])
      and teacher_id in (
        select au.id from public.admin_users au where au.user_id = auth.uid()
      )
    )
  );

drop policy if exists live_classes_super_delete on public.live_classes;
create policy live_classes_super_delete
  on public.live_classes for delete
  to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 12. AUDIT LOG — append-only.
--     Any admin may write an entry; super_admin and technical may read.
--     NOBODY may update or delete: no policy is created for those commands, so
--     RLS denies them outright. This is deliberate.
-- ----------------------------------------------------------------------------

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert
  on public.audit_log for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read
  on public.audit_log for select
  to authenticated
  using (public.has_admin_role(array['super_admin','technical']::user_role[]));

-- ----------------------------------------------------------------------------
-- 13. BATCHES (schema exists, UI deferred post-launch)
-- ----------------------------------------------------------------------------

alter table public.batches enable row level security;

drop policy if exists batches_admin_read on public.batches;
create policy batches_admin_read
  on public.batches for select
  to authenticated
  using (public.is_admin());

drop policy if exists batches_admin_write on public.batches;
create policy batches_admin_write
  on public.batches for all
  to authenticated
  using (public.has_admin_role(array['super_admin','content_creator']::user_role[]))
  with check (public.has_admin_role(array['super_admin','content_creator']::user_role[]));

alter table public.batch_students enable row level security;

drop policy if exists batch_students_self_read on public.batch_students;
create policy batch_students_self_read
  on public.batch_students for select
  to authenticated
  using (student_id = public.current_student_id());

drop policy if exists batch_students_admin_read on public.batch_students;
create policy batch_students_admin_read
  on public.batch_students for select
  to authenticated
  using (public.is_admin());

drop policy if exists batch_students_admin_write on public.batch_students;
create policy batch_students_admin_write
  on public.batch_students for all
  to authenticated
  using (public.has_admin_role(array['super_admin','support_staff']::user_role[]))
  with check (public.has_admin_role(array['super_admin','support_staff']::user_role[]));

commit;

-- ============================================================================
-- FOLLOW-UP ITEMS DELIBERATELY NOT HANDLED HERE
--
-- 1. courses carries BOTH `status` and `is_published`, with one public-read
--    policy per column. They are independent, so a row can be visible through
--    one and hidden by the other. Collapsing them is a schema change and is
--    sequenced separately; doing it inside a security migration would risk
--    hiding live courses.
--
-- 2. Students still have no read path to `questions`. The test-taking UI needs
--    a SECURITY DEFINER RPC that returns questions WITHOUT correct_answer,
--    plus a scoring RPC. Both belong with the test feature build.
--
-- 3. test_attempts has no INSERT policy by design -- scoring must be server
--    side. The attempt-submission RPC lands with the same work.
--
-- 4. `authenticated` retains broad table GRANTs. RLS now gates them, so this is
--    no longer exploitable, but tightening the grants is still worthwhile.
-- ============================================================================
