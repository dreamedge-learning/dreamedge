"use server";

import { revalidatePath } from "next/cache";

import { requireStudent } from "@/lib/auth-student";
import {
  profileColumns,
  resolveContactEmail,
} from "@/lib/students/profile-columns";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { firstIssue } from "@/lib/validations/form";
import type { Json } from "@/types/supabase";
import {
  ONBOARDING_STEPS,
  onboardingStepInput,
  onboardingStepSchemas,
  studentProfileInput,
  studentProfileSchema,
  type OnboardingStep,
} from "@/lib/validations/onboarding";

/**
 * The onboarding form's two writes.
 *
 * Both go through the service client, because `profile_completed` and the
 * other managed columns are closed to the student by a trigger — the point of
 * that trigger being that a student must not be able to flip their own gate.
 * Every write is scoped to the signed-in student's own row, resolved from the
 * session rather than taken from the form.
 */

interface ActionResult<T = Record<string, unknown>> {
  data?: T;
  error?: string;
}

function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/**
 * Saves one finished step.
 *
 * Autosave, so a student who gets to step 3 and loses signal — or whose
 * parent takes the phone back — does not retype steps 1 and 2 when they
 * return. `profile_completed` stays false throughout: a half-filled profile
 * must not open the gate.
 */
export async function saveOnboardingStep(
  step: string,
  formData: FormData
): Promise<ActionResult<{ saved: true }>> {
  try {
    if (!isOnboardingStep(step)) {
      return { error: "Unknown step." };
    }

    const student = await requireStudent();

    const parsed = onboardingStepSchemas[step].safeParse(
      onboardingStepInput(step, formData)
    );
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const values = parsed.data as Record<string, unknown>;
    const columns = profileColumns(values);

    const contactEmail = await resolveContactEmail(values, student.email, student.id);
    if (contactEmail.error) return { error: contactEmail.error };
    if (contactEmail.column) Object.assign(columns, contactEmail.column);

    if (Object.keys(columns).length === 0) {
      return { data: { saved: true } };
    }

    const service = createServiceClient();
    const { error } = await service
      .from("students")
      .update(columns)
      .eq("id", student.id);

    if (error) {
      console.error("saveOnboardingStep failed:", error);
      return { error: "Could not save that step. Please try again." };
    }

    return { data: { saved: true } };
  } catch (err) {
    console.error("saveOnboardingStep failed:", err);
    return { error: "Could not save that step. Please try again." };
  }
}

/**
 * The final submit.
 *
 * Validated here for the message a student should read, then handed to
 * `complete_student_profile`, which is the only thing that sets the gate.
 * The rule for what counts as a complete profile lives in that function
 * rather than here, because the Flutter app has to apply the same rule and
 * cannot share this code — see migration 20261104000100.
 */
export async function completeOnboarding(
  formData: FormData
): Promise<ActionResult<{ studentCode: string | null }>> {
  try {
    await requireStudent();

    const parsed = studentProfileSchema.safeParse(studentProfileInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const values = parsed.data as Record<string, unknown>;
    const columns = profileColumns(values);

    // The function owns the contact email, including the "that address is
    // already taken" case, so it is passed through rather than resolved here.
    const email =
      typeof values.email === "string" && values.email.trim().length > 0
        ? values.email.trim().toLowerCase()
        : undefined;

    const profile: Json = Object.fromEntries([
      ...Object.entries(columns).map(([key, value]) => [key, value ?? null]),
      ...(email ? [["email", email]] : []),
    ]);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_student_profile", {
      p_profile: profile,
    });

    if (error) {
      console.error("completeOnboarding failed:", error);
      // The function raises messages written for the student; anything else
      // is a fault on our side and should not be shown verbatim.
      const expected = ["23505", "23514", "42501", "P0002"].includes(error.code ?? "");
      return {
        error: expected ? error.message : "Could not save your profile. Please try again.",
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/profile");

    return { data: { studentCode: data ?? null } };
  } catch (err) {
    console.error("completeOnboarding failed:", err);
    return { error: "Could not save your profile. Please try again." };
  }
}
