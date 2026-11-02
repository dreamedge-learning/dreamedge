begin;

-- ---------------------------------------------------------------------------
-- The four attempt RPCs were still reachable without signing in.
--
-- 20261103000000 tried to close them with `revoke all ... from public`, which
-- is the wrong lever on a Supabase project. The `postgres` role here carries
-- ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions in `public` to
-- anon, authenticated and service_role -- so every function is born with an
-- *explicit* anon grant, and revoking PUBLIC leaves it untouched. That is why
-- `revoke ... from public, anon` was needed for get_test_questions in the
-- previous migration and why these four still showed up in the advisor
-- afterwards.
--
-- Nothing was readable through them: each one resolves current_student_id()
-- first and raises 'forbidden' when it is null, which is what an anonymous
-- caller always gets. So this closes a door that was already locked rather
-- than one standing open -- but an endpoint that can only ever refuse should
-- not be published at all, and the next function added here will inherit the
-- same default, so the lever being used needs to be the right one.
-- ---------------------------------------------------------------------------

revoke execute on function public.start_test_attempt(uuid)              from anon;
revoke execute on function public.save_test_answers(uuid, jsonb)        from anon;
revoke execute on function public.log_exam_event(uuid, text, jsonb)     from anon;
revoke execute on function public.submit_test_attempt(uuid, boolean)    from anon;

commit;
