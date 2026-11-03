import { z } from "zod";

import { normalizeIndianPhone } from "@/lib/phone";
import { formText, requiredNumber, requiredText } from "./form";

/**
 * Applying for admin access.
 *
 * An application is not an account. Nothing here creates an auth user or an
 * `admin_users` row -- it records what somebody claims about themselves and
 * the files they attached, and waits for a super admin to decide.
 */

/**
 * Roles somebody may apply for.
 *
 * `super_admin` is absent deliberately, and the table carries a CHECK
 * constraint saying the same thing. A select is the half of a form an attacker
 * gets to rewrite, so the list cannot only live in the markup.
 */
export const APPLICABLE_ROLES = [
  "teacher",
  "content_creator",
  "accountant",
  "support_staff",
  "technical",
] as const;

export type ApplicableRole = (typeof APPLICABLE_ROLES)[number];

export const ROLE_LABELS: Record<ApplicableRole, string> = {
  teacher: "Teacher",
  content_creator: "Content Creator",
  accountant: "Accountant",
  support_staff: "Support Staff",
  technical: "Technical",
};

export const ROLE_BLURBS: Record<ApplicableRole, string> = {
  teacher: "Take live classes and follow how your students are doing.",
  content_creator: "Build courses, lessons and test series.",
  accountant: "Payments, refunds, invoices and revenue.",
  support_staff: "Student records, enquiries and announcements.",
  technical: "Integrations, logs and system settings.",
};

/**
 * The three attachments, in the order the form asks for them.
 *
 * Only the CV is required. A degree certificate and an ID proof are what a
 * super admin will want before approving, but a scan is the thing an applicant
 * is least likely to have on the phone they are filling this in on, and losing
 * the application entirely is worse than chasing one file at review time. The
 * review panel says which are missing.
 */
export const DOCUMENT_KINDS = ["cv", "degree", "id_proof"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  cv: "CV / résumé",
  degree: "Degree certificate",
  id_proof: "ID proof",
};

export const REQUIRED_DOCUMENTS: DocumentKind[] = ["cv"];

/** Matches the bucket's own limit, so the browser refuses before the upload. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

export const gatePasswordSchema = z
  .string()
  .min(1, "Enter the access password.")
  .max(200, "That is not the access password.");

export const applicationDocumentSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  path: z.string().min(1).max(400),
  bytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  mime: z.string().max(120).nullable(),
});

export type ApplicationDocument = z.output<typeof applicationDocumentSchema>;

export const adminApplicationSchema = z.object({
  full_name: requiredText("Full name", 120),

  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(200, "Email is too long.")
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),

  // Stored in E.164 like every other number here, so a record found by phone
  // matches whichever screen it was typed on.
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required.")
    .transform((value) => normalizeIndianPhone(value))
    .refine((value): value is string => value !== null, {
      message: "Enter a valid 10-digit Indian mobile number.",
    }),

  qualification: requiredText("Highest qualification", 200),
  institution: z.string().trim().max(200, "Institution name is too long.").optional(),

  experience_years: requiredNumber("Teaching experience").pipe(
    z
      .number()
      .int("Experience must be a whole number of years.")
      .min(0, "Experience cannot be negative.")
      .max(60, "Experience looks too high.")
  ),

  // A comma-separated field on the form: one box is faster to fill on a phone
  // than a multi-select, and the shape stored is still an array.
  subjects: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(0, 12)
        .map((part) => part.slice(0, 60))
    ),

  about: z.string().trim().max(2000, "Please keep this under 2000 characters.").optional(),

  requested_role: z.enum(APPLICABLE_ROLES, {
    message: "Choose the role you are applying for.",
  }),

  documents: z
    .array(applicationDocumentSchema)
    .max(DOCUMENT_KINDS.length, "Too many attachments.")
    .refine(
      (docs) => new Set(docs.map((doc) => doc.kind)).size === docs.length,
      "Each document can only be attached once."
    )
    .refine(
      (docs) => REQUIRED_DOCUMENTS.every((kind) => docs.some((doc) => doc.kind === kind)),
      "Attach your CV before submitting."
    ),
});

export type AdminApplicationValues = z.output<typeof adminApplicationSchema>;

export const adminApplicationInput = (formData: FormData) => ({
  full_name: formText(formData, "full_name") ?? "",
  email: formText(formData, "email") ?? "",
  phone: formText(formData, "phone") ?? "",
  qualification: formText(formData, "qualification") ?? "",
  institution: formText(formData, "institution"),
  experience_years: formText(formData, "experience_years") ?? "",
  subjects: formText(formData, "subjects"),
  about: formText(formData, "about"),
  requested_role: formText(formData, "requested_role") ?? "",
  documents: parseDocuments(formText(formData, "documents")),
});

/**
 * The attachments arrive as one JSON field, filled in by the uploader as each
 * file finishes. Bad JSON is treated as "nothing attached" so the schema
 * produces its own missing-CV message rather than a parse error nobody can act
 * on.
 */
function parseDocuments(raw: string | undefined): unknown {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The decision a super admin records on an application. */
export const applicationDecisionSchema = z.object({
  application_id: z.string().uuid("That application is invalid."),
  role: z.enum(APPLICABLE_ROLES, { message: "Choose a role to approve them as." }),
  reason: z.string().trim().max(1000, "Please keep the reason under 1000 characters.").optional(),
});

export const gateUpdateSchema = z.object({
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(200, "That is too long."),
});
