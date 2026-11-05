import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DoubtThreadView } from "@/components/student/doubts/doubt-thread-view";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { loadDoubtThreads } from "@/lib/doubts-server";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validations/form";

export const metadata: Metadata = {
  title: "Doubt",
};

/**
 * One doubt and its replies. This is where the "your doubt has been answered"
 * notification lands (via the `/doubts/:id` redirect in next.config), so it
 * has to stand on its own without the lesson around it.
 */
export default async function DoubtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await requireCompleteStudentProfile(`/dashboard/doubts/${id}`);

  if (!uuid("Doubt").safeParse(id).success) notFound();

  const supabase = await createClient();
  // Scoped to this student as well as by RLS, so an admin who also holds a
  // student account still only sees their own doubts here.
  const [thread] = await loadDoubtThreads(supabase, { doubtId: id, studentId: student.id });
  if (!thread) notFound();

  return <DoubtThreadView initialThread={thread} />;
}
