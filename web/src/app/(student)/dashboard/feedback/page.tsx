import type { Metadata } from "next";

import { FeedbackContent } from "@/components/student/feedback/feedback-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { feedbackQueryBuilder } from "@/lib/supabase/feedback-table";
import type {
  FeedbackCategory,
  FeedbackStatus,
} from "@/lib/validations/feedback";

export const metadata: Metadata = {
  title: "Send feedback",
};

export interface FeedbackHistoryItem {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  handledAt: string | null;
}

interface Row {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
}

export default async function FeedbackPage() {
  const student = await requireCompleteStudentProfile("/dashboard/feedback");
  const supabase = await createClient();

  // Narrow, local typing on the select so we do not regenerate
  // `src/types/supabase.ts` -- three sibling branches touch that file.
  const { data } = await feedbackQueryBuilder(supabase)
    .select(
      "id, category, message, status, admin_note, handled_at, created_at",
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<Row[]>();

  const history: FeedbackHistoryItem[] = (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    message: row.message,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    handledAt: row.handled_at,
  }));

  return <FeedbackContent history={history} />;
}
