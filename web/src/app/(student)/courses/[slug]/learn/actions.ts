"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uuid } from "@/lib/validations/form";

interface ActionResult<T = unknown> {
  data?: T;
  error?: string;
}

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export interface ProgressResult {
  status: ProgressStatus;
  progressPct: number;
  lastPositionSeconds: number;
}

/** A video watched this far counts as done — the tail is credits/outro. */
const COMPLETE_THRESHOLD_PCT = 90;

async function getAuthenticatedStudent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Please log in to continue" };

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!student) return { error: "Student profile not found" };

  return { student };
}

/**
 * Resolves content_item -> topic -> subject -> course and decides whether this
 * student may record progress against the item. Free published items are open;
 * paid ones need a live enrolment on the owning course. The course id is never
 * taken from the client.
 */
async function resolveContentAccess(
  studentId: string,
  contentItemId: string
): Promise<{ courseId: string; slug: string | null } | { error: string }> {
  const service = createServiceClient();

  const { data: item } = await service
    .from("content_items")
    .select("id, topic_id, is_paid, status")
    .eq("id", contentItemId)
    .maybeSingle();

  if (!item || item.status !== "published") {
    return { error: "This content is not available" };
  }

  const { data: topic } = await service
    .from("topics")
    .select("subject_id")
    .eq("id", item.topic_id)
    .maybeSingle();

  if (!topic) return { error: "This content is not available" };

  const { data: subject } = await service
    .from("subjects")
    .select("course_id")
    .eq("id", topic.subject_id)
    .maybeSingle();

  if (!subject) return { error: "This content is not available" };

  const courseId = subject.course_id;

  const { data: course } = await service
    .from("courses")
    .select("slug")
    .eq("id", courseId)
    .maybeSingle();

  const slug = course?.slug ?? null;

  const { data: enrollment } = await service
    .from("enrollments")
    .select("id, valid_until")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .maybeSingle();

  const enrolled =
    !!enrollment &&
    (!enrollment.valid_until || new Date(enrollment.valid_until) > new Date());

  if (!enrolled && item.is_paid) {
    return { error: "Not enrolled in this course" };
  }

  return { courseId, slug };
}

async function writeProgress(
  studentId: string,
  contentItemId: string,
  progressPct: number,
  lastPositionSeconds: number,
  forceComplete: boolean
): Promise<ActionResult<ProgressResult>> {
  const service = createServiceClient();

  const pct = Math.max(
    0,
    Math.min(100, Math.round(Number.isFinite(progressPct) ? progressPct : 0))
  );
  const position = Math.max(
    0,
    Math.round(Number.isFinite(lastPositionSeconds) ? lastPositionSeconds : 0)
  );

  const { data: existing } = await service
    .from("student_progress")
    .select("status, progress_percentage, last_position_seconds, completed_at")
    .eq("student_id", studentId)
    .eq("content_item_id", contentItemId)
    .maybeSingle();

  const wasCompleted = existing?.status === "completed";
  const isCompleted = forceComplete || wasCompleted || pct >= COMPLETE_THRESHOLD_PCT;

  // Never walk a percentage backwards — rewatching a finished video should not
  // undo the record of having finished it.
  const previousPct = Number(existing?.progress_percentage ?? 0);
  const nextPct = isCompleted ? 100 : Math.max(previousPct, pct);

  const status: ProgressStatus = isCompleted
    ? "completed"
    : nextPct > 0
      ? "in_progress"
      : "not_started";

  const completedAt = isCompleted
    ? (existing?.completed_at ?? new Date().toISOString())
    : null;

  const { error } = await service.from("student_progress").upsert(
    {
      student_id: studentId,
      content_item_id: contentItemId,
      status,
      progress_percentage: nextPct,
      last_position_seconds: position,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,content_item_id" }
  );

  if (error) { console.error("[writeProgress] upsert failed:", JSON.stringify(error)); return { error: "Failed to save your progress" }; }

  return {
    data: { status, progressPct: nextPct, lastPositionSeconds: position },
  };
}

/**
 * Called from the player on a throttled interval while a video plays, and when
 * playback pauses or ends. Crossing COMPLETE_THRESHOLD_PCT completes the item.
 */
export async function updateContentProgress(input: {
  contentItemId: string;
  progressPct: number;
  lastPositionSeconds: number;
}): Promise<ActionResult<ProgressResult>> {
  try {
    const auth = await getAuthenticatedStudent();
    if ("error" in auth) return { error: auth.error };

    const access = await resolveContentAccess(auth.student.id, input.contentItemId);
    if ("error" in access) return { error: access.error };

    return await writeProgress(
      auth.student.id,
      input.contentItemId,
      input.progressPct,
      input.lastPositionSeconds,
      false
    );
  } catch {
    return { error: "Something went wrong" };
  }
}

/** The explicit "Mark as complete" button, and the end of a video. */
export async function markContentComplete(
  contentItemId: string,
  lastPositionSeconds = 0
): Promise<ActionResult<ProgressResult>> {
  try {
    const auth = await getAuthenticatedStudent();
    if ("error" in auth) return { error: auth.error };

    const access = await resolveContentAccess(auth.student.id, contentItemId);
    if ("error" in access) return { error: access.error };

    const result = await writeProgress(
      auth.student.id,
      contentItemId,
      100,
      lastPositionSeconds,
      true
    );

    if (!result.error) {
      // Dashboard counts and course progress bars read the same rows.
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/my-courses");
      if (access.slug) revalidatePath(`/courses/${access.slug}/learn`);
    }

    return result;
  } catch {
    return { error: "Something went wrong" };
  }
}

/**
 * Claims one play against a lesson's play limit.
 *
 * Play limits were enforced only in the Flutter app: the website read
 * `play_limit`, displayed it, and never claimed anything, so a student could
 * watch a two-play lesson all afternoon in a browser. This closes that.
 *
 * The semantics are copied from the app's `_ensurePlayClaimed` deliberately,
 * because a play has to mean the same thing on both platforms or the limit is
 * incoherent: claimed once when playback actually starts, not when the page
 * opens; only when a limit exists; and keyed by an idempotency key the caller
 * holds for the life of one viewing, so a retry after a timeout returns the
 * first decision instead of spending a second play.
 *
 * Runs on the request-scoped client, not the service role:
 * `register_content_play` resolves the student from `auth.uid()`.
 */
export async function claimContentPlay(
  contentItemId: string,
  idempotencyKey: string
): Promise<{
  allowed: boolean;
  plays: number;
  limit: number;
  reason: string;
}> {
  const failOpen = { allowed: true, plays: 0, limit: 0, reason: "unavailable" };

  try {
    const parsedItem = uuid("Lesson").safeParse(contentItemId);
    const parsedKey = uuid("Play key").safeParse(idempotencyKey);
    if (!parsedItem.success || !parsedKey.success) return failOpen;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("register_content_play", {
      p_content_item_id: parsedItem.data,
      p_idempotency_key: parsedKey.data,
    });

    if (error || !data || typeof data !== "object") {
      // Fails open, like the app does. A broken counter must not stop a
      // paying student watching a lesson they are entitled to -- and the
      // route's own check still refuses an already-exhausted lesson on the
      // next load, so an outage cannot be farmed for unlimited plays.
      if (error) console.error("[play claim] failed:", error);
      return failOpen;
    }

    const result = data as Record<string, unknown>;
    return {
      allowed: result.allowed === true,
      plays: Number(result.plays) || 0,
      limit: Number(result.limit) || 0,
      reason: typeof result.reason === "string" ? result.reason : "ok",
    };
  } catch (err) {
    console.error("[play claim] failed:", err);
    return failOpen;
  }
}
