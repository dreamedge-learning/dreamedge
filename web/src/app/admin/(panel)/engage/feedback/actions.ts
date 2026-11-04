"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { feedbackQueryBuilder } from "@/lib/supabase/feedback-table";
import {
  feedbackCategorySchema,
  feedbackResolutionInput,
  feedbackResolutionSchema,
  feedbackStatusSchema,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/validations/feedback";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

/**
 * The feedback inbox for support staff and the super admin.
 *
 * `student_feedback` rows carry free text from children, so the two roles
 * that answer messages (super admin, support staff) are the only ones RLS
 * admits for SELECT or UPDATE. Everything here calls `assertAdmin` with that
 * pair, so the policy and the server action say the same thing.
 */

const FEEDBACK_ROLES = ["super_admin", "support_staff"] as const;

export interface FeedbackRow {
  id: string;
  student_id: string;
  category: FeedbackCategory;
  message: string;
  source: "web" | "app";
  app_version: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
  student: StudentSummary | null;
}

export interface StudentSummary {
  id: string;
  full_name: string;
  student_code: string | null;
  class: string | null;
  board: string | null;
  email: string | null;
  phone: string | null;
}

const feedbackIdSchema = uuid("Feedback");

export interface FeedbackListFilters {
  status: FeedbackStatus | "all";
  category: FeedbackCategory | "all";
}

const listFiltersSchema = z.object({
  status: z.union([feedbackStatusSchema, z.literal("all")]).catch("all"),
  category: z.union([feedbackCategorySchema, z.literal("all")]).catch("all"),
});

export async function fetchFeedback(
  filters: Partial<FeedbackListFilters> = {},
): Promise<{ data?: FeedbackRow[]; error?: string }> {
  try {
    await assertAdmin([...FEEDBACK_ROLES]);
    const supabase = await createClient();

    const parsed = listFiltersSchema.parse({
      status: filters.status ?? "all",
      category: filters.category ?? "all",
    });

    // Fetch the feedback rows first, then the student rows in a second
    // query. A nested embed would need the generated types to know about
    // `student_feedback`, and we are deliberately not regenerating them.
    let query = feedbackQueryBuilder(supabase)
      .select(
        "id, student_id, category, message, source, app_version, status, admin_note, handled_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (parsed.status !== "all") query = query.eq("status", parsed.status);
    if (parsed.category !== "all") query = query.eq("category", parsed.category);

    const { data: rows, error } = await query;

    if (error) {
      console.error("[fetchFeedback] failed:", error);
      return { error: "Could not load feedback." };
    }

    const studentIds = Array.from(
      new Set((rows ?? []).map((row) => row.student_id)),
    );

    let studentMap = new Map<string, StudentSummary>();

    if (studentIds.length > 0) {
      const { data: students, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, student_code, class, board, email, phone")
        .in("id", studentIds);

      if (studentError) {
        // A failure here is non-fatal for the inbox -- a message without a
        // student card still has a message worth reading.
        console.warn("[fetchFeedback] student lookup failed:", studentError);
      } else {
        studentMap = new Map(
          (students ?? []).map((s) => [s.id, s as StudentSummary]),
        );
      }
    }

    return {
      data: (rows ?? []).map((row) => ({
        id: row.id,
        student_id: row.student_id,
        category: row.category,
        message: row.message,
        source: row.source,
        app_version: row.app_version,
        status: row.status,
        admin_note: row.admin_note,
        handled_at: row.handled_at,
        created_at: row.created_at,
        student: studentMap.get(row.student_id) ?? null,
      })),
    };
  } catch (err) {
    console.error("[fetchFeedback] unexpected:", err);
    return { error: describeFailure(err) };
  }
}

export async function countNewFeedback(): Promise<number> {
  try {
    const admin = await assertAdmin([...FEEDBACK_ROLES]).catch(() => null);
    if (!admin) return 0;

    const supabase = await createClient();
    const { count, error } = await feedbackQueryBuilder(supabase)
      .select("id", { count: "exact", head: true })
      .eq("status", "new");

    if (error) {
      console.error("[countNewFeedback] failed:", error);
      return 0;
    }

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Mark a feedback row as `read` without resolving it. Used for triage: a
 * support agent sees a message, wants to come back to it, and this gets it
 * out of the `new` bucket without closing the loop.
 */
export async function markFeedbackRead(
  id: string,
): Promise<{ error?: string; success?: true }> {
  try {
    const { adminUser } = await assertAdmin([...FEEDBACK_ROLES]);
    const supabase = await createClient();

    const parsedId = feedbackIdSchema.safeParse(id);
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const { data, error } = await feedbackQueryBuilder(supabase)
      .update({
        status: "read",
        handled_by: adminUser.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", parsedId.data)
      // Resolved is a terminal state -- going back to `read` would quietly
      // undo someone's close-out, and the UI doesn't offer that.
      .eq("status", "new")
      .select("id");

    if (error) {
      console.error("[markFeedbackRead] failed:", error);
      return { error: "Could not update that message." };
    }

    if (!data || data.length === 0) {
      return { error: "This message is no longer new." };
    }

    revalidatePath("/admin/engage/feedback");
    return { success: true };
  } catch (err) {
    console.error("[markFeedbackRead] unexpected:", err);
    return { error: describeFailure(err) };
  }
}

export async function resolveFeedback(
  id: string,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  try {
    const { adminUser } = await assertAdmin([...FEEDBACK_ROLES]);
    const supabase = await createClient();

    const parsedId = feedbackIdSchema.safeParse(id);
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const parsed = feedbackResolutionSchema.safeParse(
      feedbackResolutionInput(formData),
    );
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { error } = await feedbackQueryBuilder(supabase)
      .update({
        status: "resolved",
        admin_note: parsed.data.admin_note ?? null,
        handled_by: adminUser.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", parsedId.data);

    if (error) {
      console.error("[resolveFeedback] failed:", error);
      return { error: "Could not resolve that message." };
    }

    revalidatePath("/admin/engage/feedback");
    return { success: true };
  } catch (err) {
    console.error("[resolveFeedback] unexpected:", err);
    return { error: describeFailure(err) };
  }
}
