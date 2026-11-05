import type { Metadata } from "next";

import { FeedbackContent } from "@/components/student/feedback/feedback-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import {
  feedbackCategorySchema,
  feedbackStatusSchema,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/validations/feedback";

export const metadata: Metadata = {
  title: "Send feedback",
};

export interface FeedbackHistoryItem {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
  handledAt: string | null;
}

export default async function FeedbackPage() {
  await requireCompleteStudentProfile("/dashboard/feedback");
  const supabase = await createClient();

  // Students cannot SELECT the table: the row carries the team's internal
  // note. `get_my_feedback` returns the student's own rows with only the
  // columns they are meant to see.
  const { data, error } = await supabase.rpc("get_my_feedback", { p_limit: 20 });
  if (error) {
    console.error("[FeedbackPage] history failed:", error);
  }

  const history: FeedbackHistoryItem[] = [];
  for (const row of data ?? []) {
    // The table's check constraints hold these to the known values, but the
    // RPC returns plain text; parsing keeps an unexpected value from
    // reaching a label lookup as `undefined`.
    const category = feedbackCategorySchema.safeParse(row.category);
    const status = feedbackStatusSchema.safeParse(row.status);
    if (!category.success || !status.success) continue;
    history.push({
      id: row.id,
      category: category.data,
      message: row.message,
      status: status.data,
      createdAt: row.created_at,
      handledAt: row.handled_at,
    });
  }

  return <FeedbackContent history={history} />;
}
