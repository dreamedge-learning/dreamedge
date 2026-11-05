import { z } from "zod";

import { formText, requiredText } from "./form";

/**
 * The seller details printed on every receipt.
 *
 * The database checks the same rules -- a GSTIN in the right shape before the
 * switch can go on, a prefix that keeps the number within sixteen characters
 * -- so this is for saying what is wrong in words, not the last line of
 * defence.
 */

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const billingProfileSchema = z
  .object({
    legal_name: requiredText("Business name", 120),
    address: requiredText("Address", 400),
    state: requiredText("State", 60),
    state_code: z.string().regex(/^[0-9]{2}$/, "State code is two digits, e.g. 27 for Maharashtra."),
    gst_registered: z.boolean(),
    gstin: z
      .string()
      .transform((value) => value.toUpperCase())
      .refine((value) => GSTIN_PATTERN.test(value), "That GSTIN is not in the right format.")
      .optional(),
    gst_rate: z.coerce
      .number<string>()
      .min(0, "GST rate cannot be negative.")
      .max(40, "GST rate cannot be above 40%."),
    sac_code: z.string().regex(/^[0-9]{4,8}$/, "SAC code is 4 to 8 digits."),
    receipt_prefix: z
      .string()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z0-9]{1,4}$/.test(value), "Prefix is 1 to 4 letters or digits."),
    footer_note: z.string().max(500, "Footer note is too long.").optional(),
  })
  .refine((value) => !value.gst_registered || Boolean(value.gstin), {
    message: "Enter the GSTIN before switching tax invoices on.",
    path: ["gstin"],
  });

export type BillingProfileInput = z.infer<typeof billingProfileSchema>;

export const billingProfileInput = (formData: FormData) => ({
  legal_name: formText(formData, "legal_name") ?? "",
  address: (formData.get("address") as string | null)?.trim() ?? "",
  state: formText(formData, "state") ?? "",
  state_code: formText(formData, "state_code") ?? "",
  gst_registered: formData.get("gst_registered") === "true",
  gstin: formText(formData, "gstin"),
  gst_rate: formText(formData, "gst_rate") ?? "18",
  sac_code: formText(formData, "sac_code") ?? "",
  receipt_prefix: formText(formData, "receipt_prefix") ?? "",
  footer_note: (formData.get("footer_note") as string | null)?.trim() || undefined,
});
