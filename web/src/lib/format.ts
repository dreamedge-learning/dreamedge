const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("en-IN");

export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/** ₹1.2L, ₹3.4Cr — for chart axes where space is tight. */
export function formatINRCompact(amount: number): string {
  return `₹${inrCompactFormatter.format(amount)}`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Percentage change from `previous` to `current`. Returns null when there is
 * no baseline to compare against (previous period was zero but current isn't).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatRelativeTime(date: string | Date, now: number = Date.now()): string {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);

  if (Math.abs(seconds) < 45) return "just now";

  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= unitSeconds) {
      return relativeFormatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }

  return relativeFormatter.format(Math.round(seconds / 60), "minute");
}

/**
 * Up to two uppercase initials for an avatar fallback.
 *
 * Accepts null/undefined/blank because `full_name` is nullable on both
 * `students` and `admin_users` — a Google sign-in without a name set, or a
 * profile saved before the name step, used to throw here and take the whole
 * dashboard down with it.
 */
export function getInitials(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
