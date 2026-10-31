import { z } from "zod";

/**
 * Helpers for parsing server-action input.
 *
 * `FormData` values arrive as `string | File | null`, so every field reaches a
 * schema as an untyped value. These helpers normalise that before validation so
 * a missing field never silently coerces into `""` or `0`.
 */

/** The first human-readable problem from a failed parse. */
export function firstIssue<T>(error: z.ZodError<T>): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

/**
 * Trimmed string value of a `FormData` field, or `undefined` when the field is
 * absent, a `File`, or blank. Never returns `null` or `""`, so `.optional()`
 * and required-field messages both behave predictably.
 */
export function formText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function toNumericText(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "not-a-number";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return "not-a-number";
}

/** A required number that may arrive as a string. Blank and junk both fail. */
export function requiredNumber(label: string) {
  return z
    .preprocess(
      (value) => {
        const text = toNumericText(value);
        return text === undefined ? "" : text;
      },
      z
        .string()
        .min(1, `${label} is required.`)
        .regex(NUMERIC, `${label} must be a valid number.`)
    )
    .pipe(z.coerce.number<string>());
}

/** An optional number that may arrive as a string. Blank means "not provided". */
export function optionalNumber(label: string) {
  return z
    .preprocess(
      toNumericText,
      z.string().regex(NUMERIC, `${label} must be a valid number.`).optional()
    )
    .transform((value) => (value === undefined ? undefined : Number(value)));
}

/** A required, trimmed string with a labelled "is required" message. */
export function requiredText(label: string, max = 500) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : value),
    z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`)
  );
}

/** A date/timestamp string the runtime can actually parse. */
export function dateText(label: string) {
  return z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), `${label} must be a valid date.`);
}

/** A UUID coming from a select, a route param or a hidden form field. */
export function uuid(label: string) {
  return z.string().uuid(`${label} is invalid.`);
}

/**
 * Turns a thrown value into something worth showing an admin.
 *
 * `assertAdmin` throws `Unauthorized`/`Forbidden`, and those are the only real
 * permission failures. Everything else — a failed parse, a database error, a
 * bug — reports its own reason rather than being mislabelled as one.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof z.ZodError) return firstIssue(error);
  if (error instanceof Error) {
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return "You don't have permission to perform this action.";
    }
    return error.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
