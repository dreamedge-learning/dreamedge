"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { REVIEW_MAX, describeRatingError, type MyCourseRating } from "@/lib/ratings";
import { createClient } from "@/lib/supabase/server";

// `review` is optional on purpose: tapping a star sends only the stars, and
// leaving the key out of the upsert leaves any review already written alone.
// An empty string clears the review (the database stores it as no review).
const rateSchema = z.object({
  courseId: z.string().uuid("Unknown course."),
  stars: z
    .number()
    .int("Stars must be whole.")
    .min(1, "Pick at least 1 star.")
    .max(5, "5 stars is the ceiling."),
  review: z
    .string()
    .trim()
    .max(REVIEW_MAX, `Please keep your review under ${REVIEW_MAX} characters.`)
    .optional(),
});

export type RateCourseResult =
  | { ok: true; rating: MyCourseRating }
  | { ok: false; error: string };

/**
 * Writes the current student's rating for one enrolled course.
 *
 * The database is the real gate and fills in everything the student must not
 * choose: whose rating it is, when it was made, whether it is hidden. It also
 * refuses a student who has not finished a lesson in the course, and rate
 * limits writes. This function shapes the request and words the refusal.
 *
 * The write is an upsert on (student_id, course_id), the table's primary key,
 * so re-rating a course rewrites the single row rather than adding a second.
 */
export async function rateCourse(input: unknown): Promise<RateCourseResult> {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid rating." };
  }

  try {
    const student = await requireCompleteStudentProfile();
    const supabase = await createClient();
    const { courseId, stars, review } = parsed.data;

    const { data, error } = await supabase
      .from("course_ratings")
      .upsert(
        {
          // Overwritten from the session by the database; sent because the
          // upsert's conflict target needs it.
          student_id: student.id,
          course_id: courseId,
          stars,
          ...(review !== undefined ? { review } : {}),
        },
        { onConflict: "student_id,course_id" }
      )
      .select("stars, review, is_hidden, hidden_reason")
      .single();

    if (error || !data) {
      console.error("[rateCourse] failed:", error);
      return { ok: false, error: describeRatingError(error) };
    }

    // The aggregate trigger has already moved courses.rating_avg and
    // rating_count; the home page, the catalogue and the course pages read
    // them on their next render.
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/");
    revalidatePath("/courses");
    revalidatePath("/courses/[slug]", "page");

    return {
      ok: true,
      rating: {
        canRate: true,
        stars: data.stars,
        review: data.review,
        isHidden: data.is_hidden,
        hiddenReason: data.hidden_reason,
      },
    };
  } catch (err) {
    console.error("[rateCourse] unexpected:", err);
    return { ok: false, error: "Could not save your rating. Please try again." };
  }
}
