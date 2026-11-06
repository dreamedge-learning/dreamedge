-- Exam-integrity hardening (pre-launch security audit).
--
-- 1) test_attempts carried a legacy INSERT policy ("Students can submit
--    attempts", WITH CHECK student_id = get_student_id()) and no trigger
--    guarding score / percentage / status / test_id. Because table grants are
--    the Supabase defaults (INSERT granted to authenticated), that policy was
--    the only gate, and it let any signed-in student POST a fabricated,
--    already-graded attempt straight to /rest/v1/test_attempts -- bypassing
--    server-side grading, the enrolment check and max_attempts.
--
--    The real flow is start_test_attempt -> save_test_answers ->
--    submit_test_attempt, all SECURITY DEFINER functions that run as the table
--    owner and bypass RLS, so no legitimate caller needs direct INSERT.
--    Neutralise the policy (renamed so its purpose is self-evident). Reversible
--    by restoring the original name and check.
alter policy "Students can submit attempts"
  on public.test_attempts
  rename to "test_attempts_block_direct_student_insert";

alter policy "test_attempts_block_direct_student_insert"
  on public.test_attempts
  with check (false);

-- 2) The legacy 3-argument overload submit_test_attempt(p_test_id, p_answers,
--    p_started_at) is still EXECUTE-able by authenticated. It grades
--    server-side but skips the timed/proctored start->save->submit flow and
--    uses scoring logic that diverges from the live 2-argument version. No
--    client calls it. Close the door; the 2-arg attempt-based overload keeps
--    its grant.
revoke execute on function
  public.submit_test_attempt(uuid, jsonb, timestamp with time zone)
  from anon, authenticated;
