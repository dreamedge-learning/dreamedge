import type { Metadata } from "next";

import { MyDoubtsContent } from "@/components/student/doubts/my-doubts-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { isDoubtStatus, type DoubtSummary } from "@/lib/doubts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My doubts",
};

interface Row {
  id: string;
  status: string;
  body: string;
  updated_at: string;
  content_item: { title: string } | { title: string }[] | null;
  course: { title: string } | { title: string }[] | null;
  doubt_replies: { count: number }[];
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Every doubt the student has asked, across all their courses, most recent
 * activity first so a fresh answer is at the top.
 *
 * Summaries only -- no photos, so nothing here needs signing. The thread page
 * loads the full conversation.
 */
export default async function MyDoubtsPage() {
  const student = await requireCompleteStudentProfile("/dashboard/doubts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("doubts")
    .select(
      `id, status, body, updated_at,
       content_item:content_items(title),
       course:courses(title),
       doubt_replies(count)`
    )
    .eq("student_id", student.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    // Rendered by the student area's error boundary, which offers a retry.
    // Showing an empty list instead would tell the student their questions
    // had vanished.
    throw error;
  }

  const doubts: DoubtSummary[] = ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    status: isDoubtStatus(row.status) ? row.status : "open",
    body: row.body,
    lessonTitle: one(row.content_item)?.title ?? null,
    courseTitle: one(row.course)?.title ?? null,
    replyCount: row.doubt_replies[0]?.count ?? 0,
    updatedAt: row.updated_at,
  }));

  return <MyDoubtsContent doubts={doubts} />;
}
