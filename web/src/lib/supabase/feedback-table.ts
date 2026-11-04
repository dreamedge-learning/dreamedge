import type { PostgrestQueryBuilder } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  FeedbackCategory,
  FeedbackStatus,
} from "@/lib/validations/feedback";

/**
 * Narrow typing for `student_feedback` without regenerating
 * `types/supabase.ts`.
 *
 * Three branches are touching that generated file in parallel, so we keep
 * the row shape local. Drop this module the next time `types/supabase.ts`
 * is regenerated: the generated version will be the source of truth.
 */

// Object type aliases rather than interfaces: supabase-js constrains Row to
// `Record<string, unknown>`, and an `interface` does not satisfy that index
// signature in TS, where an inline type literal does. The generated types in
// `src/types/supabase.ts` use literals for the same reason.
export type StudentFeedbackRow = {
  id: string;
  student_id: string;
  category: FeedbackCategory;
  message: string;
  source: "web" | "app";
  app_version: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

export type StudentFeedbackInsert = {
  id?: string;
  student_id: string;
  category: FeedbackCategory;
  message: string;
  source: "web" | "app";
  app_version?: string | null;
  status?: FeedbackStatus;
  admin_note?: string | null;
  handled_by?: string | null;
  handled_at?: string | null;
  created_at?: string;
};

export type StudentFeedbackUpdate = {
  category?: FeedbackCategory;
  message?: string;
  source?: "web" | "app";
  app_version?: string | null;
  status?: FeedbackStatus;
  admin_note?: string | null;
  handled_by?: string | null;
  handled_at?: string | null;
};

type StudentFeedbackRelation = {
  Row: StudentFeedbackRow;
  Insert: StudentFeedbackInsert;
  Update: StudentFeedbackUpdate;
  Relationships: [];
};

type FeedbackClientOptions = {
  PostgrestVersion: "14.18";
};

type FeedbackSchema = {
  Tables: { student_feedback: StudentFeedbackRelation };
  Views: Record<string, never>;
  Functions: Record<string, never>;
};

/**
 * The typed query builder for `public.student_feedback`. We go through
 * `PostgrestQueryBuilder` directly rather than cast the whole
 * SupabaseClient, because the generated Database type does not list this
 * table yet and casting the client has not been enough to teach `from()`
 * the row shape.
 */
export function feedbackQueryBuilder(
  supabase: SupabaseClient,
): PostgrestQueryBuilder<
  FeedbackClientOptions,
  FeedbackSchema,
  StudentFeedbackRelation,
  "student_feedback"
> {
  return supabase.from("student_feedback" as never) as unknown as PostgrestQueryBuilder<
    FeedbackClientOptions,
    FeedbackSchema,
    StudentFeedbackRelation,
    "student_feedback"
  >;
}
