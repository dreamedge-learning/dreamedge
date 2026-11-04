"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

// Stars only. A separate "delete" verb would need its own schema, but the
// RLS policies on `course_ratings` deny DELETE to students anyway; the only
// writes the table accepts from this action are 1-5.
const rateSchema = z.object({
  courseId: z.string().uuid("Unknown course."),
  stars: z
    .number()
    .int("Stars must be whole.")
    .min(1, "Pick at least 1 star.")
    .max(5, "5 stars is the ceiling."),
});

export type RateCourseResult =
  | { ok: true; stars: number }
  | { ok: false; error: string };

// Narrow local row shape. supabase.ts is left untouched by hand this change
// (see CLAUDE.md), and the auto-generated types don't yet know about
// course_ratings, so we tell Postgrest what to expect per call rather than
// regenerating the file and broadening the blast radius.
interface CourseRatingInsert {
  student_id: string;
  course_id: string;
  stars: number;
}

/**
 * Writes the current student's rating for one enrolled course. RLS is the
 * real gate: a non-enrolled student, an expired enrolment, or a student
 * trying to write another student's row all fail at the database. This
 * function trusts the gate and surfaces the error cleanly.
 *
 * The write is UPSERT on (student_id, course_id) because the table's primary
 * key is the pair, so re-rating a course rewrites the single row rather than
 * inserting a second one.
 */
export async function rateCourse(
  input: unknown
): Promise<RateCourseResult> {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid rating." };
  }

  try {
    const student = await requireCompleteStudentProfile();
    const supabase = await createClient();

    const row: CourseRatingInsert = {
      student_id: student.id,
      course_id: parsed.data.courseId,
      stars: parsed.data.stars,
    };

    const { error } = await (
      supabase.from("course_ratings" as never) as unknown as {
        upsert: (
          values: CourseRatingInsert,
          opts: { onConflict: string }
        ) => Promise<{ error: { code?: string; message: string } | null }>;
      }
    ).upsert(row, { onConflict: "student_id,course_id" });

    if (error) {
      // 42501 is Postgres' RLS refusal. The two legitimate causes from the UI
      // are "the course isn't theirs" or "the enrolment has expired". Either
      // way, the user-facing message stays generic -- an admin can read the
      // server log for the specific code.
      console.error("[rateCourse] failed:", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "You can only rate a course you're currently enrolled in.",
        };
      }
      return { ok: false, error: "Could not save your rating. Please try again." };
    }

    // The aggregate trigger has already written courses.rating_avg /
    // rating_count; revalidating here keeps home, catalogue and the course
    // page in sync with the new numbers on the next render.
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/");
    revalidatePath("/courses");

    return { ok: true, stars: parsed.data.stars };
  } catch (err) {
    console.error("[rateCourse] unexpected:", err);
    return { ok: false, error: "Could not save your rating. Please try again." };
  }
}
