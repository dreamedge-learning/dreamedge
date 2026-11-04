"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { rateCourse } from "@/app/(student)/dashboard/my-courses/actions";

interface CourseRatingStarsProps {
  courseId: string;
  initialStars: number | null;
  /**
   * Optional label used by assistive technology. Defaults to a generic
   * "Rate this course" when the surrounding context doesn't already name
   * the course nearby.
   */
  label?: string;
}

const STARS: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
const LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "1 star",
  2: "2 stars",
  3: "3 stars",
  4: "4 stars",
  5: "5 stars",
};

/**
 * A 1-5 star control for an enrolled course. The optimistic value is painted
 * on click; a server failure rolls it back and surfaces the error in a small
 * live region next to the row. Kept on keyboard too: each star is a real
 * button, arrow keys would duplicate what tab + enter already does.
 *
 * This component is intentionally display-only for a logged-out visitor; the
 * only entry points are the student's "My Courses" cards and the Flutter
 * card, and both live behind an authenticated session.
 */
export function CourseRatingStars({
  courseId,
  initialStars,
  label = "Rate this course",
}: CourseRatingStarsProps) {
  const [applied, setApplied] = useState<number | null>(initialStars);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preview = hover ?? applied ?? 0;

  function handleRate(stars: 1 | 2 | 3 | 4 | 5) {
    // Painting immediately is the whole point of optimism; the caller
    // should see the star fill the moment they click, not after the round
    // trip. If the server rejects, the previous value is restored below.
    const previous = applied;
    setApplied(stars);
    setError(null);

    startTransition(async () => {
      const result = await rateCourse({ courseId, stars });
      if (!result.ok) {
        setApplied(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="flex flex-col gap-1"
      // Prevent the parent Link from swallowing a click on a star button.
      // My-courses renders each card as a <Link>, and without this a click
      // on a star navigates into the course instead of rating it.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        role="radiogroup"
        aria-label={label}
        aria-busy={isPending || undefined}
        className="flex items-center gap-0.5"
      >
        {STARS.map((n) => {
          const filled = n <= preview;
          const isCurrent = applied === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              aria-label={LABELS[n]}
              disabled={isPending}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(null)}
              onClick={() => handleRate(n)}
              className={cn(
                "rounded-sm p-0.5 transition-transform",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "hover:scale-110"
              )}
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/60"
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
        <span className="ml-1 text-xs tabular-nums text-muted-foreground">
          {applied != null ? `${applied}/5` : "Rate"}
        </span>
      </div>
      {/* `aria-live` so a screen reader hears the rollback message without the
          user having to go looking for it. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-xs text-red-500 dark:text-red-400",
          error ? "visible" : "invisible h-0"
        )}
      >
        {error ?? ""}
      </p>
    </div>
  );
}
