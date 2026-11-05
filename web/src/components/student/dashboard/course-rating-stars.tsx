"use client";

import { useState, useTransition } from "react";
import { EyeOff, Loader2, PencilLine, Star } from "lucide-react";

import { rateCourse } from "@/app/(student)/dashboard/my-courses/actions";
import { StarDisplay } from "@/components/ratings/star-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_MAX, STAR_VALUES, type MyCourseRating, type Stars } from "@/lib/ratings";
import { cn } from "@/lib/utils";

interface CourseRatingStarsProps {
  courseId: string;
  courseTitle: string;
  /** The student's rating and whether they may rate; absent while unknown. */
  initial: MyCourseRating | undefined;
}

const NOT_RATED: MyCourseRating = {
  canRate: false,
  stars: null,
  review: null,
  isHidden: false,
  hiddenReason: null,
};

/**
 * The student's 1-5 star rating for an enrolled course, and an optional
 * written review.
 *
 * Tapping a star saves it straight away: the stars paint on click and roll
 * back with the server's reason if the write is refused. The review is
 * written in a dialog, because a text box on every course card would crowd
 * the page for something most students do once.
 *
 * A student who has not finished a lesson yet sees why they cannot rate,
 * rather than stars that fail when pressed. One whose enrolment has lapsed
 * keeps seeing the rating they gave, without the controls.
 */
export function CourseRatingStars({ courseId, courseTitle, initial }: CourseRatingStarsProps) {
  const [rating, setRating] = useState<MyCourseRating>(initial ?? NOT_RATED);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!rating.canRate) {
    if (rating.stars != null) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StarDisplay value={rating.stars} starClassName="h-4 w-4" />
          <span>Your rating</span>
        </div>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        Finish a lesson to rate this course.
      </p>
    );
  }

  const preview = hover ?? rating.stars ?? 0;

  function handleRate(stars: Stars) {
    // Paint at once; restore the previous value if the server says no.
    const previous = rating;
    setRating({ ...rating, stars });
    setError(null);

    startTransition(async () => {
      const result = await rateCourse({ courseId, stars });
      if (result.ok) {
        setRating(result.rating);
      } else {
        setRating(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-0.5">
        <div
          role="radiogroup"
          aria-label={`Rate ${courseTitle}`}
          aria-busy={isPending || undefined}
          className="flex items-center gap-0.5"
        >
          {STAR_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating.stars === n}
              aria-label={n === 1 ? "1 star" : `${n} stars`}
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
                  n <= preview ? "fill-amber-400 text-amber-400" : "text-muted-foreground/60"
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <span className="ml-1 text-xs tabular-nums text-muted-foreground">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Saving" />
          ) : rating.stars != null ? (
            `${rating.stars}/5`
          ) : (
            "Rate"
          )}
        </span>
      </div>

      {rating.stars != null && (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={isPending}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          {rating.review ? "Edit your review" : "Write a review"}
        </button>
      )}

      {rating.isHidden && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Your review is hidden from the course page
            {rating.hiddenReason ? `: ${rating.hiddenReason}` : "."}
          </span>
        </p>
      )}

      {/* Announced without the student going to look for it. */}
      <p role="status" aria-live="polite" className={cn("text-xs text-red-500 dark:text-red-400", !error && "sr-only")}>
        {error ?? ""}
      </p>

      {/* Mounted only while open, so each opening starts from what is saved
          rather than from a draft abandoned last time. */}
      {dialogOpen && (
        <ReviewDialog
          onOpenChange={setDialogOpen}
          courseId={courseId}
          courseTitle={courseTitle}
          rating={rating}
          onSaved={(saved) => {
            setRating(saved);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

interface ReviewDialogProps {
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  rating: MyCourseRating;
  onSaved: (rating: MyCourseRating) => void;
}

function ReviewDialog({ onOpenChange, courseId, courseTitle, rating, onSaved }: ReviewDialogProps) {
  const [stars, setStars] = useState<number>(rating.stars ?? 5);
  const [text, setText] = useState(rating.review ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleOpenChange(next: boolean) {
    if (isSaving) return;
    onOpenChange(next);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await rateCourse({ courseId, stars, review: text });
      if (result.ok) {
        onSaved(result.rating);
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  const remaining = REVIEW_MAX - text.trim().length;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review {courseTitle}</DialogTitle>
          <DialogDescription>
            Your review appears on the course page under your first name and
            the initial of your surname. Leave the box empty to keep just the
            stars.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label id="review-stars-label">Your rating</Label>
            <div role="radiogroup" aria-labelledby="review-stars-label" className="flex gap-1">
              {STAR_VALUES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={n === 1 ? "1 star" : `${n} stars`}
                  onClick={() => setStars(n)}
                  disabled={isSaving}
                  className="rounded-sm p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <Star
                    className={cn(
                      "h-7 w-7",
                      n <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/60"
                    )}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`review-${courseId}`}>Your review (optional)</Label>
            <Textarea
              id={`review-${courseId}`}
              rows={5}
              maxLength={REVIEW_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSaving}
              placeholder="What helped you most? What could be better?"
            />
            <p className={cn("text-right text-xs tabular-nums", remaining < 0 ? "text-red-500" : "text-muted-foreground")}>
              {remaining} characters left
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-500 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={isSaving || remaining < 0}
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
