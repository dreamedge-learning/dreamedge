import { z } from "zod";
import type { Database } from "@/types/supabase";

/**
 * Zod mirrors of the Postgres enums in `src/types/supabase.ts`.
 *
 * Server actions receive enum values as plain `string` (from `FormData`, a
 * `<Select>`, or a query string). Parsing them through these schemas is what
 * turns that `string` into the literal union the generated database types
 * require — no casts, and an invalid value is reported instead of reaching the
 * database.
 *
 * The `satisfies` checks below fail to compile if a schema ever drifts from the
 * regenerated enum it mirrors.
 */
type Enums = Database["public"]["Enums"];

export const orderStatusSchema = z.enum(["pending", "completed", "failed", "refunded"]);

export const paymentMethodSchema = z.enum([
  "razorpay",
  "manual_cash",
  "manual_upi",
  "manual_bank",
]);

/** Payment methods an admin may record by hand (razorpay is gateway-only). */
export const manualPaymentMethodSchema = z.enum([
  "manual_cash",
  "manual_upi",
  "manual_bank",
]);

export const refundStatusSchema = z.enum([
  "requested",
  "approved",
  "processed",
  "rejected",
]);

/** The two outcomes an admin can apply to a requested refund. */
export const refundDecisionSchema = z.enum(["approved", "rejected"]);

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "interested",
  "converted",
  "lost",
]);

export const discountTypeSchema = z.enum(["percentage", "fixed"]);

export const testimonialTypeSchema = z.enum(["text", "video"]);

export const contentTypeSchema = z.enum([
  "video",
  "pdf",
  "note",
  "ebook",
  "pyp",
  "quiz",
]);

export const contentStatusSchema = z.enum(["draft", "published", "archived"]);

export const questionTypeSchema = z.enum([
  "mcq_single",
  "mcq_multiple",
  "true_false",
  "short_answer",
  "match_pair",
  "subjective",
  "image_based",
]);

export const difficultyLevelSchema = z.enum(["easy", "medium", "hard"]);

export const studentStatusSchema = z.enum(["active", "inactive", "blocked"]);

export const enrollmentStatusSchema = z.enum(["active", "expired", "cancelled"]);

export const notificationChannelSchema = z.enum(["push", "in_app", "email", "sms"]);

export const liveClassStatusSchema = z.enum(["scheduled", "live", "ended", "cancelled"]);

export const bannerPositionSchema = z.enum([
  "home_top",
  "home_bottom",
  "course_page",
  "dashboard",
]);

// --- Compile-time guards: each schema must still match the generated enum. ---
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Exported only so the guard below is never treated as dead code. */
export const enumsMatchDatabase = {
  order_status: true as Exact<z.infer<typeof orderStatusSchema>, Enums["order_status"]>,
  payment_method: true as Exact<z.infer<typeof paymentMethodSchema>, Enums["payment_method"]>,
  refund_status: true as Exact<z.infer<typeof refundStatusSchema>, Enums["refund_status"]>,
  lead_status: true as Exact<z.infer<typeof leadStatusSchema>, Enums["lead_status"]>,
  discount_type: true as Exact<z.infer<typeof discountTypeSchema>, Enums["discount_type"]>,
  testimonial_type: true as Exact<
    z.infer<typeof testimonialTypeSchema>,
    Enums["testimonial_type"]
  >,
  content_type: true as Exact<z.infer<typeof contentTypeSchema>, Enums["content_type"]>,
  content_status: true as Exact<z.infer<typeof contentStatusSchema>, Enums["content_status"]>,
  question_type: true as Exact<z.infer<typeof questionTypeSchema>, Enums["question_type"]>,
  difficulty_level: true as Exact<
    z.infer<typeof difficultyLevelSchema>,
    Enums["difficulty_level"]
  >,
  student_status: true as Exact<z.infer<typeof studentStatusSchema>, Enums["student_status"]>,
  enrollment_status: true as Exact<
    z.infer<typeof enrollmentStatusSchema>,
    Enums["enrollment_status"]
  >,
  notification_channel: true as Exact<
    z.infer<typeof notificationChannelSchema>,
    Enums["notification_channel"]
  >,
  live_class_status: true as Exact<
    z.infer<typeof liveClassStatusSchema>,
    Enums["live_class_status"]
  >,
  banner_position: true as Exact<
    z.infer<typeof bannerPositionSchema>,
    Enums["banner_position"]
  >,
} satisfies Record<string, true>;
