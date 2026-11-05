"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import {
  feedbackCategorySchema,
  feedbackNoteInput,
  feedbackNoteSchema,
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
 *
 * The admin's note is internal. Students read their history through the
 * `get_my_feedback` RPC, which does not return it, so nothing written in the
 * note ever reaches the student.
 *
 * `handled_by` and `handled_at` are not sent from here: a trigger stamps them
 * from the session whenever the status or note changes, and the column grants
 * refuse them from any client.
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
const sourceSchema = z.enum(["web", "app"]);

export interface FeedbackListFilters {
  status: FeedbackStatus | "all";
  category: FeedbackCategory | "all";
}

const listFiltersSchema = z.object({
  status: z.union([feedbackStatusSchema, z.literal("all")]).catch("all"),
  category: z.union([feedbackCategorySchema, z.literal("all")]).catch("all"),
});

const FEEDBACK_SELECT = `
  id, student_id, category, message, source, app_version, status, admin_note,
  handled_at, created_at,
  student:students(id, full_name, student_code, class, board, email, phone)
`;

/**
 * Narrow the text columns to the values the table's check constraints allow.
 * A row that somehow falls outside them is skipped rather than rendered with
 * a missing label.
 */
function toFeedbackRow(row: {
  id: string;
  student_id: string;
  category: string;
  message: string;
  source: string;
  app_version: string | null;
  status: string;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
  student: StudentSummary | null;
}): FeedbackRow | null {
  const category = feedbackCategorySchema.safeParse(row.category);
  const status = feedbackStatusSchema.safeParse(row.status);
  const source = sourceSchema.safeParse(row.source);
  if (!category.success || !status.success || !source.success) return null;

  return {
    ...row,
    category: category.data,
    status: status.data,
    source: source.data,
  };
}

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

    let query = supabase
      .from("student_feedback")
      .select(FEEDBACK_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);

    if (parsed.status !== "all") query = query.eq("status", parsed.status);
    if (parsed.category !== "all") query = query.eq("category", parsed.category);

    const { data: rows, error } = await query;

    if (error) {
      console.error("[fetchFeedback] failed:", error);
      return { error: "Could not load feedback." };
    }

    return {
      data: (rows ?? [])
        .map(toFeedbackRow)
        .filter((row): row is FeedbackRow => row !== null),
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
    const { count, error } = await supabase
      .from("student_feedback")
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
 * The inbox page and the sidebar badge both read from the table, so both are
 * refreshed: the badge lives in the admin layout, which a page-only
 * revalidate would leave showing the old count.
 */
function revalidateInbox() {
  revalidatePath("/admin/engage/feedback");
  revalidatePath("/admin", "layout");
}

type ActionResult = { error?: string; data?: FeedbackRow };

/**
 * Mark a feedback row as `read` without resolving it. Used for triage: a
 * support agent sees a message, wants to come back to it, and this gets it
 * out of the `new` bucket without closing the loop.
 */
export async function markFeedbackRead(id: string): Promise<ActionResult> {
  try {
    const { adminUser } = await assertAdmin([...FEEDBACK_ROLES]);

    const parsedId = feedbackIdSchema.safeParse(id);
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_feedback")
      .update({ status: "read" })
      .eq("id", parsedId.data)
      // Only from `new`: going back to `read` from `resolved` would quietly
      // undo someone's close-out, and the UI doesn't offer that.
      .eq("status", "new")
      .select(FEEDBACK_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[markFeedbackRead] failed:", error);
      return { error: "Could not update that message." };
    }
    if (!data) return { error: "This message is no longer new." };

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "mark_read",
      entity_type: "feedback",
      entity_id: parsedId.data,
      old_data: { status: "new" },
      new_data: { status: "read", category: data.category },
    });

    revalidateInbox();
    return { data: toFeedbackRow(data) ?? undefined };
  } catch (err) {
    console.error("[markFeedbackRead] unexpected:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Close a message, optionally saving the internal note in the same write.
 * An empty note box leaves any earlier note as it was rather than wiping it.
 */
export async function resolveFeedback(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { adminUser } = await assertAdmin([...FEEDBACK_ROLES]);

    const parsedId = feedbackIdSchema.safeParse(id);
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const parsed = feedbackNoteSchema.safeParse(feedbackNoteInput(formData));
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const note = parsed.data.admin_note || null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_feedback")
      .update(note ? { status: "resolved", admin_note: note } : { status: "resolved" })
      .eq("id", parsedId.data)
      .in("status", ["new", "read"])
      .select(FEEDBACK_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[resolveFeedback] failed:", error);
      return { error: "Could not resolve that message." };
    }
    if (!data) return { error: "This message has already been resolved." };

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "resolve",
      entity_type: "feedback",
      entity_id: parsedId.data,
      new_data: { status: "resolved", category: data.category, note_saved: note !== null },
    });

    revalidateInbox();
    return { data: toFeedbackRow(data) ?? undefined };
  } catch (err) {
    console.error("[resolveFeedback] unexpected:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Save or clear the internal note without changing the status, so a note can
 * be added to a message that is already resolved, or corrected later.
 */
export async function saveFeedbackNote(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { adminUser } = await assertAdmin([...FEEDBACK_ROLES]);

    const parsedId = feedbackIdSchema.safeParse(id);
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const parsed = feedbackNoteSchema.safeParse(feedbackNoteInput(formData));
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const note = parsed.data.admin_note || null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_feedback")
      .update({ admin_note: note })
      .eq("id", parsedId.data)
      .select(FEEDBACK_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[saveFeedbackNote] failed:", error);
      return { error: "Could not save the note." };
    }
    if (!data) return { error: "That message could not be found." };

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update_note",
      entity_type: "feedback",
      entity_id: parsedId.data,
      new_data: { category: data.category, note_saved: note !== null },
    });

    revalidateInbox();
    return { data: toFeedbackRow(data) ?? undefined };
  } catch (err) {
    console.error("[saveFeedbackNote] unexpected:", err);
    return { error: describeFailure(err) };
  }
}
