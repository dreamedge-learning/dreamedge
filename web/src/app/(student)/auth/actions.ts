"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface ActionResult<T = Record<string, unknown>> {
  data?: T;
  error?: string;
}

async function generateReferralCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const service = createServiceClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "DE";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const { data } = await service
      .from("students")
      .select("id")
      .eq("referral_code", code)
      .single();

    if (!data) return code;
  }

  return "DE" + Date.now().toString(36).toUpperCase().slice(-6);
}

export async function registerStudent(
  formData: FormData
): Promise<ActionResult<{ userId: string }>> {
  const fullName = formData.get("full_name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const phone = (formData.get("phone") as string) || null;
  const studentClass = (formData.get("class") as string) || null;
  const referredBy = (formData.get("referral_code") as string) || null;

  if (!fullName || fullName.trim().length < 2) {
    return { error: "Full name is required." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "An account with this email already exists." };
    }
    return { error: authError.message };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Registration failed. Please try again." };
  }

  const referralCode = await generateReferralCode();
  const service = createServiceClient();

  // NOTE: the live `students` table has no `free_trial_expires_at` column, so
  // the `free_trial_days` site setting is deliberately not read or written on
  // the signup path. Same as auth/callback/route.ts.
  const { error: insertError } = await service.from("students").insert({
    user_id: userId,
    full_name: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone,
    class: studentClass,
    referral_code: referralCode,
    referred_by: referredBy?.trim() || null,
  });

  if (insertError) {
    await service.auth.admin.deleteUser(userId);
    return { error: "Registration failed. Please try again." };
  }

  return { data: { userId } };
}

export async function loginStudent(
  formData: FormData
): Promise<ActionResult<{ userId: string }>> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError) {
    return { error: "Invalid email or password." };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Login failed. Please try again." };
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) {
    await supabase.auth.signOut();
    return { error: "Student account not found. Please register first." };
  }

  return { data: { userId } };
}

export async function forgotPassword(
  formData: FormData
): Promise<ActionResult<{ sent: boolean }>> {
  const email = formData.get("email") as string;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/reset-password`,
  });

  return { data: { sent: true } };
}

export async function resetPassword(
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Failed to update password. The link may have expired." };
  }

  return { data: { updated: true } };
}

// -----------------------------------------------------------------------------
// Phone OTP + OAuth helpers
//
// Supabase dashboard requirements:
//   Auth -> Providers -> Phone must be enabled with an SMS provider
//     (Twilio or MSG91 account configured with sender ID + credentials).
//   Auth -> Providers -> Google must be enabled with a GCP OAuth client
//     (Client ID + Secret).
// If a server action here returns an error containing "provider is not enabled"
// (or similar), the fix is in the Supabase dashboard, not this code.
// -----------------------------------------------------------------------------

const INDIAN_PHONE_RE = /^[6-9]\d{9}$/;

/** Normalize a raw user-entered Indian phone number to E.164 (+91XXXXXXXXXX). */
function normalizeIndianPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.length === 10
      ? digits
      : null;
  if (!ten || !INDIAN_PHONE_RE.test(ten)) return null;
  return `+91${ten}`;
}

function isProviderDisabledError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("provider is not enabled") ||
    m.includes("provider not enabled") ||
    m.includes("phone provider") ||
    m.includes("sms provider") ||
    m.includes("unsupported phone provider")
  );
}

export async function startPhoneOtp(
  phone: string
): Promise<ActionResult<{ phone: string }>> {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    return { error: "Enter a valid 10-digit Indian mobile number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: normalized });

  if (error) {
    if (isProviderDisabledError(error.message)) {
      console.warn(
        "[startPhoneOtp] Supabase phone provider is not enabled. " +
          "Enable it in Auth -> Providers -> Phone with a Twilio/MSG91 account."
      );
      return {
        error:
          "SMS login is not configured yet. Please try email or Google sign-in.",
      };
    }
    return { error: error.message };
  }

  return { data: { phone: normalized } };
}

export async function verifyPhoneOtp(
  phone: string,
  token: string
): Promise<ActionResult<{ userId: string; isNew: boolean }>> {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    return { error: "Enter a valid 10-digit Indian mobile number." };
  }

  const cleanToken = (token || "").replace(/\D/g, "");
  if (cleanToken.length < 4 || cleanToken.length > 10) {
    return { error: "Enter the OTP you received by SMS." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalized,
    token: cleanToken,
    type: "sms",
  });

  if (error) {
    if (isProviderDisabledError(error.message)) {
      console.warn(
        "[verifyPhoneOtp] Supabase phone provider is not enabled. " +
          "Enable it in Auth -> Providers -> Phone with a Twilio/MSG91 account."
      );
      return {
        error:
          "SMS login is not configured yet. Please try email or Google sign-in.",
      };
    }
    return { error: "Invalid or expired OTP. Please try again." };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "Verification failed. Please try again." };
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { data: { userId, isNew: false } };
  }

  const referralCode = await generateReferralCode();

  // No `free_trial_expires_at` on the live `students` table — see registerStudent.
  const syntheticEmail = `${normalized.replace(/[^0-9]/g, "")}@phone.dreamedge.local`;

  const { error: insertError } = await service.from("students").insert({
    user_id: userId,
    full_name: "Student",
    email: syntheticEmail,
    phone: normalized,
    referral_code: referralCode,
  });

  if (insertError) {
    return { error: "Could not create your student profile. Please try again." };
  }

  return { data: { userId, isNew: true } };
}
