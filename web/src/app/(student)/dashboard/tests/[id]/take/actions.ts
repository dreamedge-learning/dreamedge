"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase";

/**
 * Server actions used by the test runner.
 *
 * Each call forwards to a SECURITY DEFINER RPC that owns the business rule:
 * `start_test_attempt` enforces enrolment and attempt limits, `save_test_answers`
 * refuses writes past the deadline, `submit_test_attempt` scores atomically,
 * and `log_exam_event` keeps the integrity log. Nothing here is a gate -- the
 * database is.
 */

export interface TestQuestion {
  id: string;
  type:
    | "mcq_single"
    | "mcq_multiple"
    | "true_false"
    | "short_answer"
    | "match_pair"
    | "subjective"
    | "image_based";
  content: string;
  options: unknown;
  positive_marks: number;
  negative_marks: number;
  difficulty: string | null;
  image_url: string | null;
  hint: string | null;
  weight: number | null;
  is_required: boolean;
}

export interface AttemptStart {
  attemptId: string;
  startedAt: string;
  expiresAt: string;
  serverNow: string;
  answers: Record<string, unknown>;
  resumed: boolean;
  attemptNumber: number;
}

export async function startAttempt(
  testId: string,
): Promise<{ data?: AttemptStart; error?: string }> {
  try {
    const supabase = await createClient();
    // Only the attempt is needed here. Questions have their own call so a
    // retry on the paper can refetch without reopening the attempt row.
    const { data: startRows, error: startError } = await supabase.rpc(
      "start_test_attempt",
      { p_test_id: testId },
    );

    if (startError) return { error: translateDbMessage(startError.message) };

    const row = Array.isArray(startRows) ? startRows[0] : null;
    if (!row) return { error: "Could not start this test. Please try again." };

    return {
      data: {
        attemptId: row.attempt_id as string,
        startedAt: row.started_at as string,
        expiresAt: row.expires_at as string,
        serverNow: row.server_now as string,
        answers: (row.answers as Record<string, unknown> | null) ?? {},
        resumed: Boolean(row.resumed),
        attemptNumber: row.attempt_number as number,
      },
    };
  } catch (err) {
    console.error("[startAttempt] unexpected error:", err);
    return { error: "Could not start this test. Please try again." };
  }
}

export async function loadQuestions(
  testId: string,
): Promise<{ data?: TestQuestion[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_test_questions", {
      p_test_id: testId,
    });
    if (error) return { error: translateDbMessage(error.message) };
    return { data: (data ?? []) as TestQuestion[] };
  } catch (err) {
    console.error("[loadQuestions] unexpected error:", err);
    return { error: "Could not load this test's questions. Please try again." };
  }
}

export async function saveAnswers(
  attemptId: string,
  answers: Record<string, unknown>,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_test_answers", {
      p_attempt_id: attemptId,
      p_answers: answers as unknown as Json,
    });
    if (error) return { error: translateDbMessage(error.message) };
    return {};
  } catch (err) {
    console.error("[saveAnswers] unexpected error:", err);
    return { error: "Could not save your answers." };
  }
}

export async function logEvent(
  attemptId: string,
  kind:
    | "visibility_hidden"
    | "window_blur"
    | "fullscreen_exit"
    | "copy"
    | "paste"
    | "context_menu"
    | "resize"
    | "reload"
    | "devtools_suspected"
    | "network_lost",
  meta?: Record<string, unknown>,
): Promise<{ violations?: number; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("log_exam_event", {
      p_attempt_id: attemptId,
      p_kind: kind,
      p_meta: (meta ?? null) as unknown as Json,
    });
    if (error) return { error: translateDbMessage(error.message) };
    return { violations: Number(data ?? 0) };
  } catch (err) {
    console.error("[logEvent] unexpected error:", err);
    return { error: "Could not log that event." };
  }
}

export interface SubmitResult {
  score: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  awaitingReview: boolean;
  showResults: boolean;
}

export async function submitAttempt(
  attemptId: string,
  auto: boolean,
): Promise<{ data?: SubmitResult; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_test_attempt", {
      p_attempt_id: attemptId,
      p_auto: auto,
    });

    if (error) return { error: translateDbMessage(error.message) };

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { error: "Could not submit this attempt." };

    return {
      data: {
        score: Number(row.score ?? 0),
        totalMarks: Number(row.total_marks ?? 0),
        percentage: Number(row.percentage ?? 0),
        passed: Boolean(row.passed),
        awaitingReview: Boolean(row.awaiting_review),
        showResults: row.show_results !== false,
      },
    };
  } catch (err) {
    console.error("[submitAttempt] unexpected error:", err);
    return { error: "Could not submit this attempt. Please try again." };
  }
}

/**
 * Turns a PostgreSQL error message from the RPC guards into something a
 * student can read. The RPCs raise with `errcode = '42501'` and a short
 * english message; mapping them here keeps the UI free of DB jargon.
 */
function translateDbMessage(message: string | null | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("not enrolled")) {
    return "You are not enrolled in the course this test belongs to.";
  }
  if (text.includes("attempt limit")) {
    return "You have used every attempt for this test.";
  }
  if (text.includes("test not available")) {
    return "This test is not open at the moment.";
  }
  if (text.includes("attempt expired")) {
    return "This attempt has already expired.";
  }
  if (text.includes("attempt already submitted")) {
    return "This attempt has already been submitted.";
  }
  if (text.includes("attempt not found")) {
    return "That attempt could not be found.";
  }
  if (text.includes("forbidden")) {
    return "Please sign in again to continue.";
  }
  return message ?? "Something went wrong. Please try again.";
}
