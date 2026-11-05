"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { loadCourseReviews } from "@/app/(student)/courses/[slug]/reviews-actions";
import { StarDisplay } from "@/components/ratings/star-display";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import type { PublicReview, PublicReviewPage } from "@/lib/ratings";

interface CourseReviewsProps {
  courseId: string;
  ratingAvg: number | null;
  ratingCount: number;
  initial: PublicReviewPage;
}

/**
 * The course page's ratings summary and written reviews.
 *
 * Review text is rendered as a React text node, never as HTML, so whatever a
 * student types -- tags included -- shows as the characters they typed.
 * The summary counts every visible rating; the list holds only the ones that
 * came with words, which is why the two numbers can differ.
 */
export function CourseReviews({ courseId, ratingAvg, ratingCount, initial }: CourseReviewsProps) {
  const [reviews, setReviews] = useState<PublicReview[]>(initial.reviews);
  const [total, setTotal] = useState(initial.total);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  if (ratingCount <= 0 && reviews.length === 0) return null;

  function loadMore() {
    setError(null);
    startLoading(async () => {
      const page = await loadCourseReviews({ courseId, offset: reviews.length });
      if (page.error) {
        setError(page.error);
        return;
      }
      if (page.reviews.length === 0) {
        // A review was hidden since the page loaded, so the list ended early.
        setTotal(reviews.length);
        return;
      }
      setReviews((current) => [...current, ...page.reviews]);
      setTotal(page.total);
    });
  }

  return (
    <section className="mt-10" aria-labelledby="course-reviews-heading">
      <h2 id="course-reviews-heading" className="text-xl font-semibold">
        Student reviews
      </h2>

      {ratingAvg != null && ratingCount > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-3xl font-bold tabular-nums">{ratingAvg.toFixed(1)}</span>
          <div>
            <StarDisplay value={ratingAvg} starClassName="h-4 w-4" />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ratingCount === 1
                ? "1 rating from an enrolled student"
                : `${ratingCount.toLocaleString("en-IN")} ratings from enrolled students`}
            </p>
          </div>
        </div>
      )}

      {reviews.length > 0 ? (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
          {reviews.map((review, index) => (
            <li key={`${review.reviewedAt}-${index}`} className="p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium">{review.reviewerName}</span>
                <StarDisplay value={review.stars} starClassName="h-3.5 w-3.5" />
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(review.reviewedAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
                {review.review}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No written reviews yet.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}

      {reviews.length < total && (
        <Button variant="outline" className="mt-4" onClick={loadMore} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Show more reviews
        </Button>
      )}
    </section>
  );
}
