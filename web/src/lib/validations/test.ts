import { z } from "zod";
import {
  contentStatusSchema,
  difficultyLevelSchema,
  questionTypeSchema,
} from "./db-enums";
import { jsonSchema } from "./json";
import { optionalNumber, requiredNumber, requiredText, uuid } from "./form";

/**
 * Schemas for the test builder and question bank actions.
 *
 * `questions.type` is the `question_type` enum, `questions.difficulty` is
 * `difficulty_level` and `tests.status` is `content_status`; the builder sends
 * all three as plain strings, so they are parsed here rather than cast.
 */

/** A test is only ever saved as a draft or published from the builder. */
export const testStatusSchema = contentStatusSchema.exclude(["archived"]);

const marksField = (label: string) =>
  requiredNumber(label)
    .refine((value) => value >= 0, `${label} cannot be negative.`)
    .refine((value) => value <= 1000, `${label} is implausibly large.`);

/**
 * A question as the builder sends it. `id` is a client-side draft id (not a
 * database uuid), and is not persisted.
 */
export const questionPayloadSchema = z.object({
  id: z.string().max(64, "Question id is too long.").optional(),
  type: questionTypeSchema,
  // Blank text is allowed here so the builder's 30-second autosave can keep
  // storing a half-written draft; it is required to publish (see below).
  content: z.string().max(10000, "Question text is too long."),
  options: jsonSchema.nullable().default(null),
  correct_answer: jsonSchema.nullable().default(null),
  positive_marks: marksField("Positive marks"),
  negative_marks: marksField("Negative marks"),
  difficulty: difficultyLevelSchema.default("medium"),
  topic_tag: z.string().max(120, "Topic tag is too long.").nullable().default(null),
  image_url: z.string().max(2000, "Image URL is too long.").nullable().default(null),
  hint: z.string().max(2000, "Hint is too long.").nullable().default(null),
  weight: requiredNumber("Question order").refine(
    (value) => Number.isInteger(value) && value >= 0,
    "Question order must be a whole number."
  ),
  // Required unless the teacher turns it off. Defaulted rather than demanded
  // so a paper saved before this field existed still validates.
  is_required: z.boolean().default(true),
});

export type QuestionPayloadValues = z.infer<typeof questionPayloadSchema>;

export const testPayloadSchema = z.object({
  id: uuid("Test").optional(),
  name: requiredText("Test name", 200).refine(
    (value) => value.length >= 3,
    "Test name must be at least 3 characters."
  ),
  course_id: z
    .union([z.literal(""), uuid("Course")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  instructions: z
    .string()
    .max(5000, "Instructions are too long.")
    .optional()
    .transform((value) => (value === undefined || value.trim() === "" ? null : value)),
  duration_minutes: requiredNumber("Duration").refine(
    (value) => Number.isInteger(value) && value >= 1 && value <= 600,
    "Duration must be between 1 and 600 minutes."
  ),
  max_attempts: requiredNumber("Max attempts").refine(
    (value) => Number.isInteger(value) && value >= 1 && value <= 100,
    "Max attempts must be between 1 and 100."
  ),
  pass_percentage: requiredNumber("Pass percentage").refine(
    (value) => value >= 0 && value <= 100,
    "Pass percentage must be between 0 and 100."
  ),
  shuffle_questions: z.boolean().default(false),
  show_results_immediately: z.boolean().default(true),
  certificate_enabled: z.boolean().default(false),
  status: testStatusSchema,
  questions: z
    .array(questionPayloadSchema)
    .max(500, "A test cannot hold more than 500 questions."),
})
  .refine(
    (test) => test.status !== "published" || test.questions.length > 0,
    { message: "Add at least one question before publishing.", path: ["questions"] }
  )
  .refine(
    (test) =>
      test.status !== "published" ||
      test.questions.every((question) => question.content.trim().length > 0),
    {
      message: "Every question needs its question text before publishing.",
      path: ["questions"],
    }
  );

export type TestPayloadValues = z.infer<typeof testPayloadSchema>;

/** List filters; "all" (or nothing) means "don't filter". */
export const testFilterSchema = z.object({
  course_id: z.union([z.literal("all"), uuid("Course filter")]).optional(),
  status: z.union([z.literal("all"), contentStatusSchema]).optional(),
});

export const testIdSchema = uuid("Test");

/** A question bank entry, which always carries a correct answer. */
export const questionBankItemSchema = z.object({
  type: questionTypeSchema,
  content: requiredText("Question text", 10000),
  options: jsonSchema.nullable().default(null),
  correct_answer: jsonSchema,
  positive_marks: marksField("Positive marks"),
  negative_marks: marksField("Negative marks"),
  difficulty: difficultyLevelSchema.default("medium"),
  topic_tag: z.string().max(120, "Topic tag is too long.").nullable().default(null),
  image_url: z.string().max(2000, "Image URL is too long.").nullable().default(null),
  hint: z.string().max(2000, "Hint is too long.").nullable().default(null),
});

export const questionBankUpdateSchema = z
  .object({
    type: questionTypeSchema.optional(),
    content: requiredText("Question text", 10000).optional(),
    options: jsonSchema.nullable().optional(),
    correct_answer: jsonSchema.optional(),
    positive_marks: optionalNumber("Positive marks").refine(
      (value) => value === undefined || (value >= 0 && value <= 1000),
      "Positive marks must be between 0 and 1000."
    ),
    negative_marks: optionalNumber("Negative marks").refine(
      (value) => value === undefined || (value >= 0 && value <= 1000),
      "Negative marks must be between 0 and 1000."
    ),
    difficulty: difficultyLevelSchema.optional(),
    topic_tag: z.string().max(120, "Topic tag is too long.").nullable().optional(),
    image_url: z.string().max(2000, "Image URL is too long.").nullable().optional(),
    hint: z.string().max(2000, "Hint is too long.").nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update."
  );

export const questionBankIdSchema = uuid("Question");
