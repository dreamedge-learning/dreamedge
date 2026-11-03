-- Take two superseded overloads out of the exposed API.
--
-- submit_test_attempt(p_test_id, p_answers, p_started_at) is the serious one.
-- It predates the exam-integrity work: it takes the start time from the
-- caller, never looks at an attempt row, and inserts straight into
-- test_attempts. Any signed-in student could call it over PostgREST with a
-- flattering p_started_at and a full answer map and score a test without ever
-- starting one -- bypassing the server-side deadline, the attempt window and
-- the recorded time taken. The live clients both call
-- submit_test_attempt(p_attempt_id, p_auto), so nothing references it.
--
-- register_content_play(p_content_item_id) is the pre-idempotency version.
-- Both overloads answer on the same PostgREST path, and the one-argument form
-- skips the claim key added in play_claim_idempotency, so a retry double-burns
-- a play. The Flutter player passes p_idempotency_key.
--
-- Revoked rather than dropped: a revoke is reversible and cannot take a live
-- caller down with it. Dropping both is the follow-up once the next app
-- release has been out long enough to be sure nothing old is still calling.

revoke all on function public.submit_test_attempt(uuid, jsonb, timestamptz)
  from anon, authenticated, public;

revoke all on function public.register_content_play(uuid)
  from anon, authenticated, public;
