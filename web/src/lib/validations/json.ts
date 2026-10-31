import { z } from "zod";
import type { Json } from "@/types/supabase";

/**
 * Validates that a value really is JSON-serialisable, and types it as the
 * generated `Json` column type. Used for the `options` and `correct_answer`
 * columns on `questions` / `question_bank`, whose shape varies by question
 * type but which must always be storable as jsonb.
 */
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    // Values are optional so an object carrying an explicit `undefined` still
    // parses, matching the generated `{ [key: string]: Json | undefined }`.
    z.record(z.string(), jsonSchema.optional()),
  ])
);
