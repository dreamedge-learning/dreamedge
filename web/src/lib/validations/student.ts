import { z } from "zod";
import {
  leadStatusSchema,
  studentStatusSchema,
  testimonialTypeSchema,
} from "./db-enums";
import { formText, optionalNumber, requiredText, uuid } from "./form";

/**
 * Schemas for the admin student, lead and testimonial actions.
 *
 * `students` has no `is_active` column: student state lives in the
 * `student_status` enum column `status` (`active | inactive | blocked`).
 */

export const studentIdSchema = uuid("Student");

export const studentStatusUpdateSchema = z.object({
  studentId: uuid("Student"),
  status: studentStatusSchema,
});

export const bulkStudentStatusUpdateSchema = z.object({
  studentIds: z
    .array(uuid("Student"))
    .min(1, "Select at least one student.")
    .max(500, "Select no more than 500 students at a time."),
  status: studentStatusSchema,
});

/**
 * The student list's status dropdown. "all" (or nothing) means "don't filter";
 * anything else must be a real `student_status`.
 */
export const studentStatusFilterSchema = z
  .union([z.literal("all"), studentStatusSchema])
  .optional();

/**
 * The student list's source dropdown. Online sign-ups and records typed in at
 * the Kalmeshwar counter are worth telling apart: the second kind arrives
 * with cash already collected and often without a real email.
 */
export const studentSourceFilterSchema = z
  .union([
    z.literal("all"),
    z.enum(["self_online", "admin_offline", "admin_import"]),
  ])
  .optional();

export const studentListFilterSchema = z.object({
  status: studentStatusFilterSchema,
  source: studentSourceFilterSchema,
  courseId: uuid("Course filter").optional(),
  page: optionalNumber("Page").refine(
    (value) => value === undefined || (Number.isInteger(value) && value >= 1),
    "Page must be a whole number of 1 or more."
  ),
  pageSize: optionalNumber("Page size").refine(
    (value) => value === undefined || (Number.isInteger(value) && value >= 1 && value <= 10000),
    "Page size must be between 1 and 10000."
  ),
});

// --- Leads ---

export const leadCreateSchema = z.object({
  name: requiredText("Name", 120).refine(
    (value) => value.length >= 2,
    "Name must be at least 2 characters."
  ),
  phone: z
    .string()
    .min(6, "Phone number looks too short.")
    .max(20, "Phone number looks too long.")
    .optional(),
  email: z.string().email("Enter a valid email address.").optional(),
  source: z.string().max(50, "Source is too long.").default("other"),
  remarks: z.string().max(2000, "Remarks are too long.").optional(),
});

export function leadCreateInput(formData: FormData) {
  return {
    name: formText(formData, "name"),
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
    source: formText(formData, "source") ?? "other",
    remarks: formText(formData, "remarks"),
  };
}

export const leadUpdateSchema = z
  .object({
    status: leadStatusSchema.optional(),
    remarks: z.string().max(2000, "Remarks are too long.").optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.remarks !== undefined,
    "Nothing to update."
  );

export const leadIdSchema = uuid("Lead");

/** The lead list's status dropdown; "all" means "don't filter". */
export const leadListFilterSchema = z.object({
  status: z.union([z.literal("all"), leadStatusSchema]).optional(),
});

// --- Testimonials ---

export const testimonialSchema = z
  .object({
    student_name: requiredText("Student name", 120),
    content: z.string().max(2000, "Testimonial text is too long.").optional(),
    video_url: z.string().max(500, "Video URL is too long.").optional(),
    type: testimonialTypeSchema.default("text"),
    year: z
      .string()
      .regex(/^\d{4}$/, "Year must be a 4-digit year.")
      .optional(),
  })
  .refine(
    (value) => value.type !== "video" || value.video_url !== undefined,
    { message: "A video testimonial needs a video URL.", path: ["video_url"] }
  )
  .refine(
    (value) => value.type !== "text" || value.content !== undefined,
    { message: "A text testimonial needs some testimonial text.", path: ["content"] }
  );

export function testimonialInput(formData: FormData) {
  return {
    student_name: formText(formData, "student_name"),
    content: formText(formData, "content"),
    video_url: formText(formData, "video_url"),
    type: formText(formData, "type") ?? "text",
    year: formText(formData, "year"),
  };
}

export const testimonialIdSchema = uuid("Testimonial");

export const testimonialOrderSchema = z
  .array(uuid("Testimonial"))
  .min(1, "Nothing to reorder.");
