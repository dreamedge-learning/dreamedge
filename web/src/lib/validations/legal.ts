import { z } from "zod";

import { LEGAL_SLUGS } from "@/lib/legal";
import { dateText, formText, requiredText } from "./form";

/**
 * Editing a policy page.
 *
 * The body is plain text and stays plain text: there is no HTML to sanitise
 * because no path exists for markup to reach the page. Length is capped well
 * above the longest current document so a paste accident cannot put a
 * megabyte into a row every visitor reads.
 */
export const legalDocumentSchema = z.object({
  slug: z.enum(LEGAL_SLUGS, { message: "That is not a policy page." }),
  title: requiredText("Title", 160),
  effective_date: dateText("Effective date"),
  body: z
    .string()
    .trim()
    .min(1, "The policy cannot be empty.")
    .max(60000, "That is too long for one policy page."),
});

export const legalDocumentInput = (formData: FormData) => ({
  slug: formText(formData, "slug") ?? "",
  title: formText(formData, "title") ?? "",
  effective_date: formText(formData, "effective_date") ?? "",
  body: (formData.get("body") as string | null) ?? "",
});
