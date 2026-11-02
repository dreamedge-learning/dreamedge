begin;

-- ============================================================================
-- Closing the RPC surface, and pinning search_path on what was left mutable.
--
-- Everything in `public` is an endpoint. PostgREST exposes every function in
-- the schema at /rest/v1/rpc/<name>, and a function created without an
-- explicit revoke carries EXECUTE to PUBLIC -- which anon and authenticated
-- both inherit. Two of those should never have been reachable by a student.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The admin login throttle is not a student-facing endpoint.
--
-- `record_admin_login_attempt` records a failed admin sign-in and trips a
-- lockout. Any signed-in student could call it in a loop with an admin's email
-- and lock that admin out of their own panel -- a denial of service against the
-- people running the business, from an ordinary student account.
--
-- `admin_login_blocked` answers whether an email is currently locked out,
-- which tells a caller which admin addresses exist.
--
-- Both are called from the server with the service role, which bypasses these
-- grants entirely, so nothing legitimate loses access.
-- ----------------------------------------------------------------------------

revoke execute on function public.record_admin_login_attempt(text, text, boolean)
  from public, anon, authenticated;

revoke execute on function public.admin_login_blocked(text, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Trigger functions are not endpoints either.
--
-- These three exist to fire on INSERT/UPDATE and have no business being
-- callable by name. PostgreSQL does not check EXECUTE when a trigger fires, so
-- revoking it stops the RPC without stopping the trigger.
--
-- `enforce_refund_cap` and `fill_refunds_processed_by` guard refunds;
-- `log_enrollment_change` writes the audit trail. Reachable as RPCs they are a
-- way to run refund and audit logic outside the statement it was meant to
-- guard.
-- ----------------------------------------------------------------------------

revoke execute on function public.enforce_refund_cap()
  from public, anon, authenticated;

revoke execute on function public.fill_refunds_processed_by()
  from public, anon, authenticated;

revoke execute on function public.log_enrollment_change()
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The exam housekeeping job, and the question reader.
--
-- `expire_stale_attempts` sweeps abandoned attempts and is for the scheduler,
-- not for whoever is sitting the paper -- a student calling it could close
-- their own live attempt. 20261103000000 granted it to service_role but left
-- the PUBLIC grant that a new function is born with.
--
-- `get_test_questions` was dropped and recreated in that same migration, which
-- reset it to PUBLIC. It refuses an unauthenticated caller on its own, so this
-- is defence in depth rather than a hole being closed -- but an endpoint that
-- answers nobody should not be reachable by nobody.
-- ----------------------------------------------------------------------------

revoke execute on function public.expire_stale_attempts()
  from public, anon, authenticated;
grant  execute on function public.expire_stale_attempts() to service_role;

revoke execute on function public.get_test_questions(uuid) from public, anon;
grant  execute on function public.get_test_questions(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. An explicit search_path on the nine functions that had none.
--
-- A SECURITY DEFINER function with a mutable search_path resolves its own
-- table and operator references against whatever the caller's search_path
-- says, so a caller who can create objects in an earlier schema can decide
-- what the function's own body means while it runs as the owner.
--
-- `alter function ... set search_path` rather than rewriting nine bodies: the
-- setting is what the advisor is asking for, and rewriting working trigger
-- functions to attach it would be the riskier change.
--
-- The grants on `current_student_id` are deliberately left alone. RLS policies
-- across this schema call it as the querying role, so revoking EXECUTE from
-- `authenticated` would make every one of those policies fail -- it is
-- reachable as an RPC because it has to be reachable from a policy, and it
-- discloses only the caller's own student id.
-- ----------------------------------------------------------------------------

alter function public.current_student_id()            set search_path = public, pg_temp;
alter function public.get_student_id()                 set search_path = public, pg_temp;
alter function public.increment_student_count(uuid)    set search_path = public, pg_temp;
alter function public.update_updated_at()              set search_path = public, pg_temp;
alter function public.update_students_updated_at()     set search_path = public, pg_temp;
alter function public.update_courses_updated_at()      set search_path = public, pg_temp;
alter function public.update_enrollments_updated_at()  set search_path = public, pg_temp;
alter function public.update_lessons_updated_at()      set search_path = public, pg_temp;
alter function public.update_progress_updated_at()     set search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 5. rate_limit_hits: RLS on, no policy, which is the correct pair.
--
-- The advisor reports this as INFO and it is intentional: the table is written
-- only by `record_admin_login_attempt` and read only by `admin_login_blocked`,
-- both SECURITY DEFINER and both now unreachable by anon and authenticated. No
-- policy means no direct access, which is exactly what is wanted. Said here so
-- the next person reading the advisor does not add one.
-- ----------------------------------------------------------------------------

comment on table public.rate_limit_hits is
  'Admin sign-in throttle. RLS on with no policy on purpose: reached only '
  'through record_admin_login_attempt and admin_login_blocked, which are '
  'SECURITY DEFINER and service-role only.';

commit;
