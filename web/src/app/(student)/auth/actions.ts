"use server";

import { normalizeIndianPhone } from "@/lib/phone";
import { RATE_LIMITS, describeRetryAfter, rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";
import {
  createStudentProfile,
  findStudentByUserId,
} from "@/lib/students/create-student";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface ActionResult<T = Record<string, unknown>> {
  data?: T;
  error?: string;
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

  const limit = await rateLimit({
    bucket: "register",
    key: email.toLowerCase(),
    ...RATE_LIMITS.register,
  });
  if (!limit.allowed) {
    return {
      error: `Too many sign-up attempts from this device. Please try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
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

  const created = await createStudentProfile({
    userId,
    source: "self_online",
    authEmail: email,
    fields: {
      full_name: fullName,
      email,
      phone,
      class: studentClass,
      referred_by: referredBy,
    },
  });

  if (created.error) {
    // An auth user with no student row can never sign in past the profile
    // gate and cannot register again with the same address, so roll it back
    // rather than leaving the student locked out of their own email.
    await createServiceClient().auth.admin.deleteUser(userId);
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

  const limit = await rateLimit({
    bucket: "login",
    key: email.toLowerCase(),
    ...RATE_LIMITS.login,
  });
  if (!limit.allowed) {
    return {
      error: `Too many sign-in attempts. Please try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
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

  const limit = await rateLimit({
    bucket: "passwordReset",
    key: email.toLowerCase(),
    ...RATE_LIMITS.passwordReset,
  });
  if (!limit.allowed) {
    return {
      error: `Too many password reset requests. Please try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
  }

  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/reset-password`,
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

  const limit = await rateLimit({
    bucket: "phoneOtpSend",
    key: normalized,
    ...RATE_LIMITS.phoneOtpSend,
  });
  if (!limit.allowed) {
    return {
      error: `Too many OTP requests for this number. Please try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
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

  const limit = await rateLimit({
    bucket: "phoneOtpVerify",
    key: normalized,
    ...RATE_LIMITS.phoneOtpVerify,
  });
  if (!limit.allowed) {
    return {
      error: `Too many incorrect codes. Please try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
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

  const existing = await findStudentByUserId(userId);
  if (existing) {
    return { data: { userId, isNew: false } };
  }

  // No name, no email: a phone sign-in gives us neither. The onboarding form
  // collects both, which is why the profile gate exists.
  const created = await createStudentProfile({
    userId,
    source: "self_online",
    authPhone: normalized,
    fields: { phone: normalized },
  });

  if (created.error) {
    return { error: "Could not create your student profile. Please try again." };
  }

  return { data: { userId, isNew: true } };
}
