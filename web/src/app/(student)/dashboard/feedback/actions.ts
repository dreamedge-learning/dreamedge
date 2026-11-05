"use server";

import { revalidatePath } from "next/cache";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import {
  feedbackSubmissionInput,
  feedbackSubmissionSchema,
} from "@/lib/validations/feedback";

/**
 * Submit a piece of feedback from the student dashboard.
 *
 * The free-text message is written as-is: only admins read this inbox, so
 * sanitising here would hide a student's actual words from the person meant
 * to answer them. React escapes it on display. The 10-2000 character range is enforced by both the zod
 * schema and a `check` on the column, and the 24-hour rate limit is a
 * trigger on the table -- so the limit holds whether the write comes from
 * here, the Flutter app, or anything else that signs in as the student.
 */
export async function submitFeedback(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  // Outside the try: a signed-out or half-registered student is redirected,
  // and Next.js redirects by throwing, which the catch below would swallow.
  await requireCompleteStudentProfile("/dashboard/feedback");

  try {
    const parsed = feedbackSubmissionSchema.safeParse(
      feedbackSubmissionInput(formData),
    );
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const supabase = await createClient();
    // No `student_id`, status or timestamps: the database fills those from
    // the session and refuses them if a client sends them, so the row always
    // belongs to whoever is signed in.
    const { error } = await supabase.from("student_feedback").insert({
      category: parsed.data.category,
      message: parsed.data.message,
      source: "web",
    });

    if (error) {
      // `53400` is the SQLSTATE the rate-limit trigger raises; its `message`
      // is already human-readable, so we hand it straight back rather than
      // replacing it with something vaguer.
      if (error.code === "53400") {
        return { error: error.message };
      }
      console.error("[submitFeedback] insert failed:", error);
      return { error: "Could not send your feedback. Please try again." };
    }

    revalidatePath("/dashboard/feedback");
    return { success: true };
  } catch (err) {
    console.error("[submitFeedback] unexpected:", err);
    return { error: describeFailure(err) };
  }
}
