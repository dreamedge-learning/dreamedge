/**
 * Date-range filter bounds.
 *
 * The range inputs in the panel are `<input type="date">`, so a bound arrives
 * as a bare `2026-11-02`. Compared against a timestamp that reads as midnight
 * UTC, which has two consequences: the last day of the range is dropped
 * entirely, and the first day starts five and a half hours late for everyone
 * sitting in Kalmeshwar. On the common "today" preset the two together hide
 * most of what the admin was looking for.
 *
 * Pinning both ends to IST makes a picked day mean that day on the team's own
 * calendar, which is already how the dashboard buckets its months. The list
 * queries and the exports both go through here, so a filtered list and a file
 * exported from it cover the same days.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive start of a range whose bound may be a bare date. */
export function rangeStart(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T00:00:00+05:30` : value;
}

/** Inclusive end of a range whose bound may be a bare date. */
export function rangeEnd(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T23:59:59.999+05:30` : value;
}
