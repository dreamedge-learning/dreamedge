import { z } from "zod";

import { manualPaymentMethodSchema } from "./db-enums";
import { dateText, formText } from "./form";
import { ONBOARDING_FIELDS, studentProfileSchema } from "./onboarding";

/**
 * Registering a student at the counter.
 *
 * The same profile the student would have filled in online, plus the three
 * things only an admin knows: when the form was actually collected, what they
 * want noted against the record, and what was paid.
 *
 * The profile half is `studentProfileSchema` rather than a copy of it. The
 * printed sheet, the online form and this screen have to ask for the same
 * fields in the same order, or the admin has to work out what maps to what on
 * every registration.
 */

export const offlineRegistrationSchema = studentProfileSchema.extend({
  /** Defaults to today, backdatable for a sheet collected last week. */
  registration_date: dateText("Registration date").optional(),
  admin_notes: z.string().max(2000, "Notes are too long.").optional(),

  // Admin override from the collision panel: "I looked at the matching
  // record, and this really is a different student who happens to share
  // the address." The unique index on students.email is the backstop; this
  // only turns off the pre-insert duplicate check.
  confirm_different_student: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "1" || value === "on"),

  // --- the optional enrolment block ---
  course_id: z.string().uuid("Choose a course.").optional(),
  amount: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  payment_method: manualPaymentMethodSchema.optional(),
  receipt_number: z.string().max(60, "Receipt number is too long.").optional(),
  validity_days: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined))
    .refine(
      (value) => value === undefined || /^\d{1,4}$/.test(value),
      "Validity must be a whole number of days."
    ),
});

export type OfflineRegistrationValues = z.output<typeof offlineRegistrationSchema>;

/**
 * A profile with no email at all is allowed, because some students at the
 * centre genuinely have none and the cash is already collected. Something has
 * to be reachable, though, so one of the three numbers must be there — and
 * the parent's is required by the profile schema anyway.
 */
export const offlineRegistrationInput = (formData: FormData) => {
  const base = Object.fromEntries(
    ONBOARDING_FIELDS.map((field) => [field, (formData.get(field) as string | null) ?? ""])
  );

  return {
    ...base,
    registration_date: formText(formData, "registration_date"),
    admin_notes: formText(formData, "admin_notes"),
    confirm_different_student: formText(formData, "confirm_different_student"),
    course_id: formText(formData, "course_id"),
    amount: formText(formData, "amount"),
    payment_method: formText(formData, "payment_method"),
    receipt_number: formText(formData, "receipt_number"),
    validity_days: formText(formData, "validity_days"),
  };
};

/**
 * True when the admin filled in the enrolment block.
 *
 * The course is the trigger: an amount with no course is not an enrolment,
 * and recording one without the other would leave the revenue figures and
 * the enrolments disagreeing.
 */
export function hasEnrolment(values: OfflineRegistrationValues): boolean {
  return Boolean(values.course_id);
}
