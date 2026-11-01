import { z } from "zod";
import { bannerPositionSchema, notificationChannelSchema } from "./db-enums";
import { formText, requiredText, uuid } from "./form";

/**
 * Schemas for the Engage section: notifications and promotional banners.
 */

export const notificationIdSchema = uuid("Notification");
export const bannerIdSchema = uuid("Banner");

const optionalUrl = z
  .string()
  .trim()
  .max(2048, "URL is too long.")
  .url("Enter a valid URL.")
  .optional();

/**
 * Who a notification goes to. `course` and `student` each need their own id,
 * so the target is validated as a unit rather than as independent fields —
 * otherwise "send to a course" with no course selected would reach the
 * database and fan out to nobody.
 */
export const notificationTargetSchema = z.discriminatedUnion("target_type", [
  z.object({ target_type: z.literal("all") }),
  z.object({ target_type: z.literal("course"), course_id: uuid("Course") }),
  z.object({ target_type: z.literal("student"), target_id: uuid("Student") }),
]);

export const notificationSchema = z
  .object({
    title: requiredText("Title", 150),
    message: requiredText("Message", 1000),
    channel: notificationChannelSchema,
    action_url: optionalUrl,
    thumbnail_url: optionalUrl,
  })
  .and(notificationTargetSchema);

export const bannerSchema = z
  .object({
    title: requiredText("Title", 150),
    image_url: z
      .string()
      .trim()
      .min(1, "Image URL is required.")
      .max(2048, "URL is too long.")
      .url("Enter a valid image URL."),
    action_url: optionalUrl,
    position: bannerPositionSchema,
    starts_at: z.string().trim().min(1).optional(),
    ends_at: z.string().trim().min(1).optional(),
  })
  .refine(
    (b) => !b.starts_at || !b.ends_at || new Date(b.starts_at) < new Date(b.ends_at),
    { message: "The end date must come after the start date.", path: ["ends_at"] }
  );

export function notificationInput(formData: FormData) {
  const targetType = formText(formData, "target_type") ?? "all";
  return {
    title: formText(formData, "title"),
    message: formText(formData, "message"),
    channel: formText(formData, "channel") ?? "in_app",
    action_url: formText(formData, "action_url"),
    thumbnail_url: formText(formData, "thumbnail_url"),
    target_type: targetType,
    ...(targetType === "course" ? { course_id: formText(formData, "course_id") } : {}),
    ...(targetType === "student" ? { target_id: formText(formData, "target_id") } : {}),
  };
}

export function bannerInput(formData: FormData) {
  return {
    title: formText(formData, "title"),
    image_url: formText(formData, "image_url"),
    action_url: formText(formData, "action_url"),
    position: formText(formData, "position") ?? "home_top",
    starts_at: formText(formData, "starts_at"),
    ends_at: formText(formData, "ends_at"),
  };
}
