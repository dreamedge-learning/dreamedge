import { z } from "zod";

import { normalizeIndianPhone } from "@/lib/phone";

/**
 * The mandatory student profile, validated once.
 *
 * Shared by the four-step form in the browser, the server action behind it,
 * the profile editor on the dashboard and the admin's offline registration
 * form. One schema is the point: the printed sheet handed across the counter
 * at Kalmeshwar, the form a student fills on a phone and the screen an admin
 * types into all have to ask for the same fields in the same order, or the
 * admin has to look up what maps to what on every single registration.
 */

export const STUDENT_CLASSES = ["6", "7", "8", "9", "10"] as const;

export const STUDENT_BOARDS = ["CBSE", "State", "ICSE", "Other"] as const;

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

/** Required text that reports its own field name. */
const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

/** Optional text where a blank input means "not provided", never `""`. */
const optional = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const indianPhone = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => normalizeIndianPhone(value) !== null,
      `${label} must be a 10-digit Indian mobile number.`
    );

const optionalIndianPhone = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine(
      (value) => value === undefined || normalizeIndianPhone(value) !== null,
      `${label} must be a 10-digit Indian mobile number.`
    );

/**
 * A date of birth that could belong to a school student.
 *
 * The window is wide on purpose — a repeating Class 10 student and an
 * exceptionally young Class 6 student both have to get through — but a
 * fat-fingered year is worth catching at the keyboard rather than in a
 * certificate three months later.
 */
const dateOfBirth = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => {
    if (value === undefined) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return false;

    const years = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return years >= 5 && years <= 30;
  }, "Enter a date of birth between 5 and 30 years ago.");

// --- Step 1: the student ---

export const onboardingStudentSchema = z.object({
  full_name: required("Full name", 120).refine(
    (value) => value.length >= 2,
    "Full name must be at least 2 characters."
  ),
  date_of_birth: dateOfBirth,
  gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// --- Step 2: school ---

export const onboardingAcademicsSchema = z.object({
  class: z.enum(STUDENT_CLASSES, { message: "Choose the class you are in." }),
  board: z.enum(STUDENT_BOARDS, { message: "Choose your board." }),
  school_name: required("School name", 160),
});

// --- Step 3: how to reach you ---

export const onboardingContactSchema = z.object({
  // Plenty of Class 6 students have no phone of their own, which is exactly
  // why the parent's number below is the required one.
  phone: optionalIndianPhone("Your mobile number"),
  parent_name: required("Parent or guardian name", 120).refine(
    (value) => value.length >= 2,
    "Parent or guardian name must be at least 2 characters."
  ),
  parent_phone: indianPhone("Parent or guardian mobile number"),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine(
      (value) => value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email address."
    ),
});

// --- Step 4: where you are ---

export const onboardingLocationSchema = z.object({
  city: required("City", 80),
  state: required("State", 80),
  pincode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine(
      (value) => value === undefined || /^[1-9][0-9]{5}$/.test(value),
      "A PIN code is six digits and does not start with zero."
    ),
  address_line: optional("Address", 300),
});

export const ONBOARDING_STEPS = ["student", "academics", "contact", "location"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/*
 * Annotated rather than `satisfies`, so every entry has the same type.
 * Indexing a map of four differently-shaped schemas yields a union, and a
 * union of `ZodError`s cannot be handed to one error formatter.
 */
export const onboardingStepSchemas: Record<OnboardingStep, z.ZodType> = {
  student: onboardingStudentSchema,
  academics: onboardingAcademicsSchema,
  contact: onboardingContactSchema,
  location: onboardingLocationSchema,
};

/** Every field, for the final submit and for the admin's one-page form. */
export const studentProfileSchema = onboardingStudentSchema
  .extend(onboardingAcademicsSchema.shape)
  .extend(onboardingContactSchema.shape)
  .extend(onboardingLocationSchema.shape);

export type StudentProfileInput = z.input<typeof studentProfileSchema>;
export type StudentProfileValues = z.output<typeof studentProfileSchema>;

export const ONBOARDING_FIELDS = [
  "full_name",
  "date_of_birth",
  "gender",
  "class",
  "board",
  "school_name",
  "phone",
  "parent_name",
  "parent_phone",
  "email",
  "city",
  "state",
  "pincode",
  "address_line",
] as const;

export type OnboardingField = (typeof ONBOARDING_FIELDS)[number];

/** The step each field belongs to, so an error can send focus to the right one. */
export const FIELD_STEP: Record<OnboardingField, OnboardingStep> = {
  full_name: "student",
  date_of_birth: "student",
  gender: "student",
  class: "academics",
  board: "academics",
  school_name: "academics",
  phone: "contact",
  parent_name: "contact",
  parent_phone: "contact",
  email: "contact",
  city: "location",
  state: "location",
  pincode: "location",
  address_line: "location",
};

/** Reads a step's fields out of a `FormData`, untrimmed and untyped. */
export function onboardingStepInput(
  step: OnboardingStep,
  formData: FormData
): Record<string, unknown> {
  const fields = ONBOARDING_FIELDS.filter((field) => FIELD_STEP[field] === step);

  return Object.fromEntries(
    fields.map((field) => [field, (formData.get(field) as string | null) ?? ""])
  );
}

export function studentProfileInput(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(
    ONBOARDING_FIELDS.map((field) => [
      field,
      (formData.get(field) as string | null) ?? "",
    ])
  );
}
