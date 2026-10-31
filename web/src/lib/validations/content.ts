import { z } from "zod";
import { contentStatusSchema, contentTypeSchema } from "./db-enums";
import { optionalNumber, requiredText, uuid } from "./form";

/** Schemas for the content manager tree: subjects, topics and content items. */

export const subjectCreateSchema = z.object({
  course_id: uuid("Course"),
  name: requiredText("Subject name", 120),
});

export const subjectUpdateSchema = z
  .object({
    name: requiredText("Subject name", 120).optional(),
    // The colour radio group submits nothing when a legacy subject's colour is
    // not one of the presets, so treat null/blank as "leave it alone".
    color_code: z.preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #6366f1.")
        .optional()
    ),
    is_visible: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update."
  );

export const topicCreateSchema = z.object({
  subject_id: uuid("Subject"),
  name: requiredText("Topic name", 160),
});

export const topicUpdateSchema = z
  .object({
    name: requiredText("Topic name", 160).optional(),
    description: z.string().max(2000, "Description is too long.").nullable().optional(),
    is_visible: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update."
  );

export const contentItemCreateSchema = z.object({
  topic_id: uuid("Topic"),
  title: requiredText("Title", 200),
  type: contentTypeSchema,
});

export const contentItemUpdateSchema = z
  .object({
    title: requiredText("Title", 200).optional(),
    type: contentTypeSchema.optional(),
    status: contentStatusSchema.optional(),
    description: z.string().max(5000, "Description is too long.").nullable().optional(),
    file_url: z.string().max(2000, "File URL is too long.").nullable().optional(),
    video_id: z.string().max(200, "Video id is too long.").nullable().optional(),
    is_paid: z.boolean().optional(),
    is_downloadable: z.boolean().optional(),
    is_printable: z.boolean().optional(),
    play_limit: optionalNumber("Play limit")
      .nullable()
      .refine(
        (value) => value == null || (Number.isInteger(value) && value >= 1),
        "Play limit must be a whole number of 1 or more."
      ),
    duration_seconds: optionalNumber("Duration")
      .nullable()
      .refine(
        (value) => value == null || (Number.isInteger(value) && value >= 0),
        "Duration must be a whole number of seconds."
      ),
    weight: optionalNumber("Order").refine(
      (value) => value === undefined || (Number.isInteger(value) && value >= 0),
      "Order must be a whole number."
    ),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update."
  );

export const reorderSchema = z.object({
  table: z.enum(["subjects", "topics", "content_items"]),
  orderedIds: z.array(uuid("Item")).min(1, "Nothing to reorder."),
});
