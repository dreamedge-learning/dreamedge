import { z } from "zod";

import { formText } from "./form";

/**
 * Shared feedback shapes.
 *
 * Kept apart from the Engage validations because a student's feedback and an
 * admin's engagement write are two different directions of traffic: a student
 * writes `insert`, an admin writes `update`, and only one of them is reachable
 * from the public forms. Sharing the category list between the student page,
 * the admin inbox and the export was the point of pulling this out.
 */

export const FEEDBACK_CATEGORIES = [
  "content",
  "app_problem",
  "website_problem",
  "payment",
  "suggestion",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Human-readable labels for the categories, used on both sides. */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  content: "Course content",
  app_problem: "App problem",
  website_problem: "Website problem",
  payment: "Payment or billing",
  suggestion: "Suggestion",
  other: "Something else",
};

export const FEEDBACK_STATUSES = ["new", "read", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  read: "Read",
  resolved: "Resolved",
};

export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;
/** Keep this in lockstep with `enforce_student_feedback_rate_limit`. */
export const FEEDBACK_RATE_LIMIT_PER_DAY = 5;

export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

/**
 * The student-submission schema. The rate limit is enforced by the trigger in
 * `student_feedback`, not here, so the form can refuse a bad input without
 * reaching for the count; the trigger is what makes the limit hold against a
 * curl.
 */
export const feedbackSubmissionSchema = z.object({
  category: feedbackCategorySchema,
  message: z
    .string()
    .trim()
    .min(FEEDBACK_MESSAGE_MIN, `Please write at least ${FEEDBACK_MESSAGE_MIN} characters.`)
    .max(FEEDBACK_MESSAGE_MAX, `Please keep it under ${FEEDBACK_MESSAGE_MAX} characters.`),
});

export function feedbackSubmissionInput(formData: FormData) {
  return {
    category: formText(formData, "category"),
    message: formText(formData, "message"),
  };
}

/**
 * The team's internal note on a message. Never shown to the student: their
 * history comes from `get_my_feedback`, which does not return it. An empty
 * string means "no note".
 */
export const feedbackNoteSchema = z.object({
  admin_note: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1000 characters.")
    .optional(),
});

export function feedbackNoteInput(formData: FormData) {
  return {
    admin_note: formText(formData, "admin_note"),
  };
}
