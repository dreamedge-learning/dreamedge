/**
 * Course ratings: 1-5 stars and an optional short review.
 *
 * Shared by the student pages, the public course page and the admin
 * moderation screen. The rules that matter -- who may rate (an active
 * enrolment and at least one finished lesson), how often, what a student may
 * change, and what the public may see -- live in the database; the limits
 * here mirror them so a form can say "too long" before a round trip, not
 * instead of one.
 */

import type { UserRole } from "@/types/database";

/** Who can read every rating and hide or restore a review. */
export const RATING_MODERATOR_ROLES: UserRole[] = ["super_admin", "support_staff"];

/** Mirrors `course_ratings_review_length`. */
export const REVIEW_MAX = 500;

/** Mirrors `course_ratings_hidden_reason_length`. */
export const HIDE_REASON_MIN = 3;
export const HIDE_REASON_MAX = 500;

/** Reviews per page on the public course page. */
export const REVIEWS_PAGE_SIZE = 10;

/**
 * How many ratings a course needs before the home page quotes an average for
 * the whole platform. One or two early ratings are an anecdote, not a score.
 */
export const PLATFORM_RATING_MIN_COUNT = 10;

export type Stars = 1 | 2 | 3 | 4 | 5;

export const STAR_VALUES: readonly Stars[] = [1, 2, 3, 4, 5];

/** The signed-in student's own rating for one enrolled course. */
export interface MyCourseRating {
  canRate: boolean;
  stars: number | null;
  review: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
}

/** One review as the public course page shows it. */
export interface PublicReview {
  reviewerName: string;
  stars: number;
  review: string;
  reviewedAt: string;
}

export interface PublicReviewPage {
  reviews: PublicReview[];
  total: number;
  /** Set when the read failed, so "no more reviews" and "try again" differ. */
  error?: string;
}

interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Turns a refusal from `course_ratings` into something a student can act on.
 *
 * The triggers word their own refusals for a person (the rate limit, a field
 * that cannot change), so those pass straight through. An RLS refusal has a
 * message written for developers, and the only way a real student meets one
 * is rating a course they have not started or no longer have.
 */
export function describeRatingError(error: DatabaseError | null | undefined): string {
  if (!error) return "Could not save your rating. Please try again.";

  switch (error.code) {
    case "PT429":
    case "22023":
    case "P0002":
      return error.message || "Could not save your rating. Please try again.";
    case "42501":
      if (error.message && !error.message.includes("row-level security")) {
        return error.message;
      }
      return "You can rate a course once you have finished a lesson in it.";
    case "23514":
      return `Please keep your review under ${REVIEW_MAX} characters.`;
    default:
      return "Could not save your rating. Please try again.";
  }
}

/**
 * The platform-wide average the home page quotes, weighted by each course's
 * rating count. Null until there are enough ratings to mean something.
 *
 * Each course's average is stored to one decimal, so this can be off by a
 * few hundredths; it is shown to one decimal as well.
 */
export function platformRating(
  courses: ReadonlyArray<{ rating_avg: number | null; rating_count: number | null }>
): { average: number; count: number } | null {
  let weighted = 0;
  let count = 0;
  for (const course of courses) {
    const n = course.rating_count ?? 0;
    if (n <= 0 || course.rating_avg == null) continue;
    weighted += Number(course.rating_avg) * n;
    count += n;
  }
  if (count < PLATFORM_RATING_MIN_COUNT) return null;
  return { average: Math.round((weighted / count) * 10) / 10, count };
}
