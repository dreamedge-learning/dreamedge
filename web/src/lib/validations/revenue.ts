import { z } from "zod";
import {
  discountTypeSchema,
  manualPaymentMethodSchema,
  orderStatusSchema,
  paymentMethodSchema,
  refundDecisionSchema,
  refundStatusSchema,
} from "./db-enums";
import {
  dateText,
  formText,
  optionalNumber,
  requiredNumber,
  requiredText,
  uuid,
} from "./form";

/**
 * Schemas for the admin revenue actions: orders, manual payments, refunds and
 * referral codes. Money is validated here rather than trusted from the form.
 */

/** Largest single amount an admin may record by hand, in rupees. */
const MAX_AMOUNT = 10_000_000;

const amountField = (label: string) =>
  requiredNumber(label)
    .refine((value) => value > 0, `${label} must be greater than zero.`)
    .refine((value) => value <= MAX_AMOUNT, `${label} is implausibly large.`)
    .refine(
      // Floating point: compare against the rounded paisa value with a tolerance
      // rather than `value * 100 === Math.round(value * 100)`, which rejects
      // perfectly ordinary amounts such as 1234.56.
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      `${label} cannot have more than two decimal places.`
    );

// --- Order / refund list filters ---
// "all" (or nothing) means "don't filter"; any other value must be a real enum
// member, so a hand-edited query string can't reach the database.

export const orderFilterSchema = z.object({
  status: z.union([z.literal("all"), orderStatusSchema]).optional(),
  paymentMethod: z.union([z.literal("all"), paymentMethodSchema]).optional(),
  courseId: z.union([z.literal("all"), uuid("Course filter")]).optional(),
});

export const refundFilterSchema = z.object({
  status: z.union([z.literal("all"), refundStatusSchema]).optional(),
});

// --- Manual payment ---

export const manualPaymentSchema = z.object({
  student_id: uuid("Student"),
  course_id: uuid("Course"),
  amount: amountField("Amount"),
  payment_method: manualPaymentMethodSchema,
  reference: z.string().max(120, "Reference is too long.").optional(),
  remarks: z.string().max(1000, "Remarks are too long.").optional(),
  payment_date: dateText("Payment date").optional(),
  /**
   * Overrides the course's own `validity_days`.
   *
   * Needed at the counter, where a student joining mid-session is sometimes
   * given access to the end of the academic year rather than a full term.
   */
  validity_days: optionalNumber("Validity").refine(
    (value) =>
      value === undefined || (Number.isInteger(value) && value >= 1 && value <= 3650),
    "Validity must be between 1 and 3650 days."
  ),
});

export function manualPaymentInput(formData: FormData) {
  return {
    student_id: formText(formData, "student_id"),
    course_id: formText(formData, "course_id"),
    amount: formText(formData, "amount"),
    payment_method: formText(formData, "payment_method"),
    reference: formText(formData, "reference"),
    remarks: formText(formData, "remarks"),
    payment_date: formText(formData, "payment_date"),
    validity_days: formText(formData, "validity_days"),
  };
}

// --- Refunds ---

export const refundInitiateSchema = z.object({
  order_id: uuid("Order"),
  amount: amountField("Refund amount"),
  reason: requiredText("Reason", 1000).refine(
    (value) => value.length >= 5,
    "Reason must be at least 5 characters."
  ),
});

export function refundInitiateInput(formData: FormData) {
  return {
    order_id: formText(formData, "order_id"),
    amount: formText(formData, "amount"),
    reason: formText(formData, "reason"),
  };
}

export const refundProcessSchema = z.object({
  refundId: uuid("Refund"),
  action: refundDecisionSchema,
  reason: z.string().max(1000, "Reason is too long.").optional(),
});

// --- Referral codes ---

const discountFields = {
  discount_type: discountTypeSchema,
  discount_value: requiredNumber("Discount value").refine(
    (value) => value > 0,
    "Discount value must be greater than zero."
  ),
  max_uses: optionalNumber("Max uses").refine(
    (value) => value === undefined || (Number.isInteger(value) && value >= 1),
    "Max uses must be a whole number of 1 or more."
  ),
  valid_until: dateText("Valid until").optional(),
};

function discountValueInRange(value: {
  discount_type: "percentage" | "fixed";
  discount_value: number;
}): boolean {
  return value.discount_type === "percentage"
    ? value.discount_value >= 1 && value.discount_value <= 100
    : value.discount_value >= 1 && value.discount_value <= MAX_AMOUNT;
}

const discountRangeIssue = {
  message:
    "A percentage discount must be between 1 and 100; a fixed discount must be at least ₹1.",
  path: ["discount_value"],
};

export const referralCodeCreateSchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z0-9]{3,20}$/, "Code must be 3-20 uppercase alphanumeric characters."),
    ...discountFields,
  })
  .refine(discountValueInRange, discountRangeIssue);

export const referralCodeUpdateSchema = z
  .object(discountFields)
  .refine(discountValueInRange, discountRangeIssue);

export function referralCodeInput(formData: FormData) {
  return {
    code: formText(formData, "code")?.toUpperCase(),
    discount_type: formText(formData, "discount_type"),
    discount_value: formText(formData, "discount_value"),
    max_uses: formText(formData, "max_uses"),
    valid_until: formText(formData, "valid_until"),
  };
}

export const referralCodeIdSchema = uuid("Referral code");

// --- Analytics ---

export const topCoursesLimitSchema = z
  .number()
  .int("Limit must be a whole number.")
  .min(1, "Limit must be at least 1.")
  .max(100, "Limit must be 100 or less.");
