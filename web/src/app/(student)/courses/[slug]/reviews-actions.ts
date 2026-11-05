"use server";

import { z } from "zod";

import { REVIEWS_PAGE_SIZE, type PublicReviewPage } from "@/lib/ratings";
import { createClient } from "@/lib/supabase/server";

const pageSchema = z.object({
  courseId: z.string().uuid(),
  offset: z.number().int().min(0).max(10_000),
});

/**
 * One page of a course's public reviews.
 *
 * Open to signed-out visitors: `course_reviews` returns only what is safe to
 * publish (first name and last initial, stars, text, date) for visible
 * reviews on published courses, so there is nothing here to gate.
 */
export async function loadCourseReviews(input: unknown): Promise<PublicReviewPage> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { reviews: [], total: 0 };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("course_reviews", {
      p_course_id: parsed.data.courseId,
      p_limit: REVIEWS_PAGE_SIZE,
      p_offset: parsed.data.offset,
    });

    if (error || !data) {
      if (error) console.error("[course] reviews could not be read:", error);
      return { reviews: [], total: 0, error: "Could not load reviews. Please try again." };
    }

    return {
      reviews: data.map((row) => ({
        reviewerName: row.reviewer_name,
        stars: row.stars,
        review: row.review,
        reviewedAt: row.reviewed_at,
      })),
      total: Number(data[0]?.total_count ?? 0),
    };
  } catch (err) {
    console.error("[course] reviews could not be read:", err);
    return { reviews: [], total: 0, error: "Could not load reviews. Please try again." };
  }
}
