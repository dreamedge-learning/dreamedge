import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface StarDisplayProps {
  /** 0-5; fractions fill the star they fall in partly. */
  value: number;
  className?: string;
  /** Tailwind size classes for each star. */
  starClassName?: string;
}

/**
 * Read-only stars for an average or a single review.
 *
 * A fractional value (4.3) fills the fifth star 30% of the way by clipping a
 * filled star over an outline one, so an average reads at a glance without
 * rounding 4.3 up to a fifth whole star. The number itself is announced once
 * for screen readers instead of five separate star images.
 */
export function StarDisplay({ value, className, starClassName = "h-4 w-4" }: StarDisplayProps) {
  const clamped = Math.max(0, Math.min(5, value));

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${Number.isInteger(clamped) ? clamped : clamped.toFixed(1)} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="relative inline-block" aria-hidden="true">
            <Star className={cn(starClassName, "text-muted-foreground/40")} />
            {fill > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className={cn(starClassName, "fill-amber-400 text-amber-400")} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
