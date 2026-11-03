// OAuth / email-link callback. Exchanges the auth code for a session cookie
// and ensures the authenticated user has a matching `students` row.
//
// Supabase dashboard requirements:
//   Auth -> URL Configuration -> Site URL = your production URL
//   Auth -> URL Configuration -> Redirect URLs must include
//     http://localhost:3000/auth/callback and your production /auth/callback
//   Auth -> Providers -> Google must be enabled with a GCP OAuth client
//     (Client ID + Secret pasted into Supabase; the Supabase-provided
//     redirect URL added to the GCP OAuth client's authorized redirect URIs).

import { NextResponse } from "next/server";

import {
  createStudentProfile,
  findStudentByEmail,
  findStudentByUserId,
} from "@/lib/students/create-student";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface ResolvedStudent {
  profileCompleted: boolean;
  /**
   * Set when registration is closed and this sign-in would have created a
   * brand-new student. An existing student is never blocked: closing sign-ups
   * must not lock out the people who already paid.
   */
  registrationClosed?: boolean;
}

/**
 * Finds or creates the student behind a freshly signed-in auth user.
 *
 * Looked up by auth user first, then by email. The second lookup is what
 * stops the duplicate that matters here: a student registered at the
 * Kalmeshwar centre, or by email months ago, who now signs in with Google.
 * Supabase hands that a different auth user id, and inserting on that alone
 * would leave them with two profiles — enrolments on the old one, progress on
 * the new one, and a support call nobody can unpick. Re-pointing the existing
 * row at the new auth user keeps one student to one record.
 */
async function resolveStudent(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<ResolvedStudent> {
  const existing = await findStudentByUserId(user.id);
  if (existing) {
    return { profileCompleted: existing.profile_completed };
  }

  if (user.email) {
    const byEmail = await findStudentByEmail(user.email);

    if (byEmail) {
      // Only when the row is not already bound to a different live account.
      // If it is, the two really are different people sharing an address and
      // a new profile is the honest outcome — the insert's unique constraint
      // on email will then say so rather than merging them silently.
      if (byEmail.user_id === user.id) {
        return { profileCompleted: byEmail.profile_completed };
      }

      const service = createServiceClient();
      const { data: boundTo } = await service.auth.admin.getUserById(byEmail.user_id);

      if (!boundTo?.user) {
        await service.from("students").update({ user_id: user.id }).eq("id", byEmail.id);
        return { profileCompleted: byEmail.profile_completed };
      }
    }
  }

  // Both lookups failed, so this is a genuinely new student -- which is the
  // only case the registration switch should stop. Google sign-in bypassed it
  // entirely before, so closing registrations closed the form and left the
  // Continue-with-Google button creating accounts beside it.
  const settings = await getSiteSettings();
  if (!settings.student_registration_open) {
    return { profileCompleted: false, registrationClosed: true };
  }

  const meta = user.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    null;

  const created = await createStudentProfile({
    userId: user.id,
    source: "self_online",
    authEmail: user.email,
    authPhone: user.phone,
    fields: {
      full_name: fullName,
      phone: user.phone,
      avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    },
  });

  if (created.error) throw new Error(created.error);

  // Google gives a name and an email and nothing else — no class, no board,
  // no parent contact. The profile is deliberately incomplete here so the
  // gate sends them to the form.
  return { profileCompleted: false };
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "auth_failed")}`
    );
  }

  let profileCompleted = false;
  let registrationClosed = false;

  try {
    const student = await resolveStudent({
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone,
      user_metadata: data.user.user_metadata,
    });
    profileCompleted = student.profileCompleted;
    registrationClosed = student.registrationClosed ?? false;
  } catch (err) {
    console.error("[auth/callback] failed to resolve student row", err);
  }

  // Signed out again, because the exchange above already minted a session for
  // an auth user with no student row behind it. Sent to /register rather than
  // /login with an error code: that page explains why and carries the number
  // to call, which a query parameter nobody renders would not.
  if (registrationClosed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/register`);
  }

  // A student with an unfinished profile goes to the form, carrying the
  // destination they were originally headed for so the form can return them
  // to it rather than dropping everyone on the dashboard.
  if (!profileCompleted) {
    const onboarding = new URL("/onboarding", origin);
    if (next !== "/dashboard") onboarding.searchParams.set("next", next);
    return NextResponse.redirect(onboarding);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
