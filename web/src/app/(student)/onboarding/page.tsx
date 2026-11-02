import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/student/onboarding/onboarding-form";
import { requireStudent } from "@/lib/auth-student";
import { indianPhoneDigits } from "@/lib/phone";
import { isSyntheticEmail } from "@/lib/students/identity";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_FIELDS, type OnboardingField } from "@/lib/validations/onboarding";

export const metadata: Metadata = {
  title: "Complete your profile",
};

/**
 * Deliberately `requireStudent` and not `requireCompleteStudentProfile`: this
 * is the page the gate redirects to, so gating it would redirect to itself.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const student = await requireStudent();
  const { next } = await searchParams;

  // A student who has already completed onboarding and types /onboarding
  // (or follows a stale link) is not here to re-answer the form -- the
  // whole gate's point was to collect this once. Send them on. Same
  // `next` safety check as below, so a `?next=` cannot turn this into an
  // open redirect.
  if ((student as Record<string, unknown>).profile_completed === true) {
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    redirect(safeNext);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const record = student as Record<string, unknown>;
  const text = (key: string) => {
    const value = record[key];
    return typeof value === "string" ? value : "";
  };

  const emailPlaceholder = isSyntheticEmail(text("email"));

  const initialValues = Object.fromEntries(
    ONBOARDING_FIELDS.map((field) => [field, ""])
  ) as Record<OnboardingField, string>;

  initialValues.full_name = text("full_name") === "Student" ? "" : text("full_name");
  initialValues.date_of_birth = text("date_of_birth");
  initialValues.gender = text("gender");
  initialValues.class = text("class");
  initialValues.board = text("board");
  initialValues.school_name = text("school_name");
  // Shown as the ten digits a student recognises, not the +91 form the
  // column holds.
  initialValues.phone = indianPhoneDigits(text("phone")) ?? "";
  initialValues.parent_name = text("parent_name");
  initialValues.parent_phone = indianPhoneDigits(text("parent_phone")) ?? "";
  initialValues.email = emailPlaceholder ? "" : text("email");
  initialValues.city = text("city");
  initialValues.state = text("state");
  initialValues.pincode = text("pincode");
  initialValues.address_line = text("address_line");

  // Only a same-origin path, so `?next=` cannot be turned into an open
  // redirect to somebody else's site.
  const destination = next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  return (
    <OnboardingForm
      initialValues={initialValues}
      signInEmail={user?.email ?? null}
      emailIsPlaceholder={emailPlaceholder}
      next={destination}
    />
  );
}
