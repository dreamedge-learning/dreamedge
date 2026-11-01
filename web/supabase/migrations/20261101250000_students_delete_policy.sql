-- ---------------------------------------------------------------------------
-- Let a super admin delete a student.
--
-- `students` had no DELETE policy for `authenticated` at all — only the
-- blanket service_role grant — so a delete from the admin panel would have
-- been silently refused by RLS, affecting zero rows and reporting success.
--
-- Deletion is restricted to super_admin, mirroring courses_super_delete:
-- support_staff can block a student, but destroying records is not theirs.
--
-- Worth stating plainly, because the cascade is wide: every table that
-- references students does so ON DELETE CASCADE, so removing a student also
-- removes their enrollments, orders, test attempts, progress, notifications,
-- referral codes and batch memberships. Order history is financial record —
-- the admin UI shows the exact counts and the revenue total in the confirm
-- dialog before any of this runs.
-- ---------------------------------------------------------------------------

drop policy if exists students_super_delete on public.students;
create policy students_super_delete
  on public.students for delete
  to authenticated
  using (public.is_super_admin());
