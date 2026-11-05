"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import {
  DOUBT_ANSWER_ROLES,
  DOUBT_READ_ROLES,
  REPLY_BODY_MAX,
  REPLY_BODY_MIN,
  describeDoubtError,
  isDoubtStatus,
  type DoubtStatus,
  type DoubtThread,
} from "@/lib/doubts";
import { loadDoubtThreads } from "@/lib/doubts-server";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

/**
 * The Doubts inbox.
 *
 * Reads and writes run on the admin's own session, so the table's policies
 * back up every role check here: a support staff member who reaches the reply
 * action by hand is refused by the database as well as by `assertAdmin`.
 */

export interface DoubtInboxRow {
  id: string;
  status: DoubtStatus;
  body: string;
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
  studentName: string;
  studentClass: string | null;
  courseId: string;
  courseTitle: string | null;
  lessonTitle: string | null;
  assigneeName: string | null;
  replyCount: number;
}

export interface DoubtInboxFilters {
  status?: string;
  courseId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffDoubtThread extends DoubtThread {
  student: {
    id: string;
    name: string;
    className: string | null;
    board: string | null;
    code: string | null;
  };
  subjectName: string | null;
  topicName: string | null;
  lessonType: string | null;
  assignedTo: { id: string; name: string } | null;
  answeredAt: string | null;
  closedAt: string | null;
}

const filterSchema = z.object({
  status: z.enum(["all", "open", "answered", "closed"]).default("open"),
  courseId: z.union([z.literal("all"), z.string().uuid()]).default("all"),
  search: z.string().trim().max(100, "Search is too long.").default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

const replySchema = z.object({
  doubtId: uuid("Doubt"),
  body: z
    .string()
    .trim()
    .min(REPLY_BODY_MIN, "Please write a reply.")
    .max(REPLY_BODY_MAX, "That reply is too long."),
  imagePath: z.string().trim().min(1).max(300).nullable(),
});

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function fetchDoubtInbox(filters: DoubtInboxFilters = {}) {
  try {
    await assertAdmin(DOUBT_READ_ROLES);

    const parsed = filterSchema.safeParse(filters);
    if (!parsed.success) {
      return { data: [] as DoubtInboxRow[], count: 0, error: firstIssue(parsed.error) };
    }

    const { status, courseId, search, page, pageSize } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("admin_list_doubts", {
      p_status: status === "all" ? undefined : status,
      p_course_id: courseId === "all" ? undefined : courseId,
      p_search: search || undefined,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });

    if (error) {
      console.error("fetchDoubtInbox failed:", error);
      return { data: [] as DoubtInboxRow[], count: 0, error: "Could not load doubts." };
    }

    const rows = data ?? [];
    return {
      data: rows.map(
        (row): DoubtInboxRow => ({
          id: row.id,
          status: isDoubtStatus(row.status) ? row.status : "open",
          body: row.body,
          hasImage: row.has_image,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          studentName: row.student_name,
          studentClass: row.student_class ?? null,
          courseId: row.course_id,
          courseTitle: row.course_title ?? null,
          lessonTitle: row.lesson_title ?? null,
          assigneeName: row.assignee_name ?? null,
          replyCount: row.reply_count,
        })
      ),
      // Every row carries the full total; an empty page has none to read.
      count: rows.length > 0 ? Number(rows[0].total_count) : 0,
    };
  } catch (err) {
    console.error("fetchDoubtInbox failed:", err);
    return { data: [] as DoubtInboxRow[], count: 0, error: describeFailure(err) };
  }
}

/**
 * Doubts nobody has answered yet, for the sidebar badge. Zero for roles that
 * cannot see the inbox, and zero on any failure: a badge is not worth an
 * error on every admin page.
 */
export async function countOpenDoubts(): Promise<number> {
  try {
    await assertAdmin(DOUBT_READ_ROLES);
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("doubts")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    if (error) {
      console.error("countOpenDoubts failed:", error);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Courses for the inbox filter. Every course, published or not. */
export async function fetchDoubtCourses() {
  try {
    await assertAdmin(DOUBT_READ_ROLES);
    const supabase = await createClient();
    const { data, error } = await supabase.from("courses").select("id, title").order("title");

    if (error) {
      console.error("fetchDoubtCourses failed:", error);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

interface MetaRow {
  id: string;
  answered_at: string | null;
  closed_at: string | null;
  assigned_to: string | null;
  student:
    | { id: string; full_name: string; class: string | null; board: string | null; student_code: string | null }
    | { id: string; full_name: string; class: string | null; board: string | null; student_code: string | null }[]
    | null;
  content_item:
    | ContentItemMeta
    | ContentItemMeta[]
    | null;
  assignee: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
}

interface ContentItemMeta {
  type: string;
  topic:
    | { name: string; subject: { name: string } | { name: string }[] | null }
    | { name: string; subject: { name: string } | { name: string }[] | null }[]
    | null;
}

export async function fetchStaffDoubt(
  doubtId: string
): Promise<{ data?: StaffDoubtThread; error?: string }> {
  try {
    await assertAdmin(DOUBT_READ_ROLES);

    const parsed = uuid("Doubt").safeParse(doubtId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const [threads, meta] = await Promise.all([
      loadDoubtThreads(supabase, { doubtId: parsed.data }),
      supabase
        .from("doubts")
        .select(
          `id, answered_at, closed_at, assigned_to,
           student:students(id, full_name, class, board, student_code),
           content_item:content_items(type, topic:topics(name, subject:subjects(name))),
           assignee:admin_users!doubts_assigned_to_fkey(id, full_name)`
        )
        .eq("id", parsed.data)
        .maybeSingle(),
    ]);

    const thread = threads[0];
    if (!thread || meta.error || !meta.data) {
      if (meta.error) console.error("fetchStaffDoubt failed:", meta.error);
      return { error: "That doubt could not be found." };
    }

    const row = meta.data as unknown as MetaRow;
    const student = one(row.student);
    const item = one(row.content_item);
    const topic = one(item?.topic);
    const assignee = one(row.assignee);

    return {
      data: {
        ...thread,
        student: {
          id: student?.id ?? "",
          name: student?.full_name ?? "Student",
          className: student?.class ?? null,
          board: student?.board ?? null,
          code: student?.student_code ?? null,
        },
        subjectName: one(topic?.subject)?.name ?? null,
        topicName: topic?.name ?? null,
        lessonType: item?.type ?? null,
        assignedTo: assignee ? { id: assignee.id, name: assignee.full_name } : null,
        answeredAt: row.answered_at,
        closedAt: row.closed_at,
      },
    };
  } catch (err) {
    console.error("fetchStaffDoubt failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Acting
// ---------------------------------------------------------------------------

function revalidateInbox(doubtId: string) {
  revalidatePath("/admin/doubts");
  revalidatePath(`/admin/doubts/${doubtId}`);
}

/**
 * Answers a doubt. The database marks it answered, assigns it to this teacher
 * if it was unassigned, and puts the notification in the student's inbox --
 * all in the same transaction as the reply, so a student is never told about
 * an answer that failed to save.
 */
export async function replyToDoubtAsStaff(input: {
  doubtId: string;
  body: string;
  imagePath: string | null;
}): Promise<{ data?: StaffDoubtThread; error?: string }> {
  try {
    const { adminUser } = await assertAdmin(DOUBT_ANSWER_ROLES);

    const parsed = replySchema.safeParse(input);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { data: reply, error } = await supabase
      .from("doubt_replies")
      .insert({
        doubt_id: parsed.data.doubtId,
        body: parsed.data.body,
        image_path: parsed.data.imagePath,
      })
      .select("id")
      .single();

    if (error || !reply) {
      console.error("replyToDoubtAsStaff failed:", error);
      return { error: describeDoubtError(error) };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "reply",
      entity_type: "doubt",
      entity_id: parsed.data.doubtId,
      new_data: { reply_id: reply.id, body: parsed.data.body, has_image: !!parsed.data.imagePath },
    });

    revalidateInbox(parsed.data.doubtId);
    return fetchStaffDoubt(parsed.data.doubtId);
  } catch (err) {
    console.error("replyToDoubtAsStaff failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Closes a doubt, or reopens a closed one.
 *
 * Reopening puts it back where the conversation left it: answered if a
 * teacher spoke last, unanswered if the student did. Sending every reopened
 * doubt to "unanswered" would put already-answered questions back in the
 * queue and inflate the badge.
 */
export async function setDoubtClosed(input: {
  doubtId: string;
  closed: boolean;
}): Promise<{ data?: StaffDoubtThread; error?: string }> {
  try {
    const { adminUser } = await assertAdmin(DOUBT_ANSWER_ROLES);

    const parsed = uuid("Doubt").safeParse(input.doubtId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { data: before, error: readError } = await supabase
      .from("doubts")
      .select("status")
      .eq("id", parsed.data)
      .maybeSingle();

    if (readError || !before) {
      return { error: "That doubt could not be found." };
    }

    let next: DoubtStatus = "closed";
    if (!input.closed) {
      const { data: last } = await supabase
        .from("doubt_replies")
        .select("author_kind")
        .eq("doubt_id", parsed.data)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      next = last?.author_kind === "admin" ? "answered" : "open";
    }

    if (before.status === next) {
      return fetchStaffDoubt(parsed.data);
    }

    const { error } = await supabase.from("doubts").update({ status: next }).eq("id", parsed.data);
    if (error) {
      console.error("setDoubtClosed failed:", error);
      return { error: "Could not update that doubt. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: input.closed ? "close" : "reopen",
      entity_type: "doubt",
      entity_id: parsed.data,
      old_data: { status: before.status },
      new_data: { status: next },
    });

    revalidateInbox(parsed.data);
    return fetchStaffDoubt(parsed.data);
  } catch (err) {
    console.error("setDoubtClosed failed:", err);
    return { error: describeFailure(err) };
  }
}

/** Takes a doubt, so two teachers do not answer the same question. */
export async function assignDoubtToMe(
  doubtId: string
): Promise<{ data?: StaffDoubtThread; error?: string }> {
  try {
    const { adminUser } = await assertAdmin(DOUBT_ANSWER_ROLES);

    const parsed = uuid("Doubt").safeParse(doubtId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { data: before } = await supabase
      .from("doubts")
      .select("assigned_to")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!before) return { error: "That doubt could not be found." };
    if (before.assigned_to === adminUser.id) return fetchStaffDoubt(parsed.data);

    const { error } = await supabase
      .from("doubts")
      .update({ assigned_to: adminUser.id })
      .eq("id", parsed.data);

    if (error) {
      console.error("assignDoubtToMe failed:", error);
      return { error: "Could not assign that doubt. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "assign",
      entity_type: "doubt",
      entity_id: parsed.data,
      old_data: { assigned_to: before.assigned_to },
      new_data: { assigned_to: adminUser.id },
    });

    revalidateInbox(parsed.data);
    return fetchStaffDoubt(parsed.data);
  } catch (err) {
    console.error("assignDoubtToMe failed:", err);
    return { error: describeFailure(err) };
  }
}
