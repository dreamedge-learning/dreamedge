-- Revoke EXECUTE from public, anon and authenticated on the
-- update_*_updated_at trigger functions.
--
-- These exist only to fire on BEFORE UPDATE and have no business being
-- callable by name. PostgreSQL does not check EXECUTE when a trigger fires,
-- so revoking it stops the RPC without stopping the trigger -- the same
-- shape 20261103100000_rpc_exposure.sql applied to the refund and audit
-- trigger functions. The advisor flags these as callable, which is
-- surface area, not a hole.
--
-- `search_path` was pinned on these in 20261103100000; this covers the
-- grants it left alone.

begin;

revoke execute on function public.update_updated_at()              from public, anon, authenticated;
revoke execute on function public.update_students_updated_at()     from public, anon, authenticated;
revoke execute on function public.update_courses_updated_at()      from public, anon, authenticated;
revoke execute on function public.update_enrollments_updated_at()  from public, anon, authenticated;
revoke execute on function public.update_lessons_updated_at()      from public, anon, authenticated;
revoke execute on function public.update_progress_updated_at()     from public, anon, authenticated;

commit;
