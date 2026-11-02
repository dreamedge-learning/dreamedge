"use server";

import { requireStudent } from "@/lib/auth-student";
import {
  profileColumns,
  resolveContactEmail,
} from "@/lib/students/profile-columns";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { firstIssue } from "@/lib/validations/form";
import {
  studentProfileInput,
  studentProfileSchema,
} from "@/lib/validations/onboarding";

interface ActionResult<T = Record<string, unknown>> {
  data?: T;
  error?: string;
}

/**
 * The profile editor on the dashboard.
 *
 * Validated with the same schema as the onboarding form, because it is the
 * same profile: a student moving up from Class 7 to Class 8, a family
 * changing their number, or a parent correcting a school name all come
 * through here, and a field the onboarding form insisted on must not become
 * blankable afterwards.
 *
 * The managed columns -- `profile_completed`, `student_code`, the
 * registration provenance -- are untouched and unreachable: a trigger rejects
 * them for anyone but an admin.
 */
export async function updateProfile(
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  try {
    const student = await requireStudent();

    const parsed = studentProfileSchema.safeParse(studentProfileInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const values = parsed.data as Record<string, unknown>;
    const columns = profileColumns(values);

    const contactEmail = await resolveContactEmail(values, student.email, student.id);
    if (contactEmail.error) return { error: contactEmail.error };
    if (contactEmail.column) Object.assign(columns, contactEmail.column);

    const service = createServiceClient();
    const { error } = await service
      .from("students")
      .update(columns)
      .eq("id", student.id);

    if (error) {
      console.error("updateProfile failed:", error);
      return { error: "Failed to update profile. Please try again." };
    }

    return { data: { updated: true } };
  } catch (err) {
    console.error("updateProfile failed:", err);
    return { error: "Failed to update profile. Please try again." };
  }
}

export async function updateAvatar(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("avatar") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please select an image." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Image must be under 2MB." };
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return { error: "Only JPG, PNG, and WebP images are allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `students/${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) {
    if (
      uploadError.message.includes("not found") ||
      uploadError.message.includes("does not exist")
    ) {
      return {
        error:
          "Avatar storage is not set up yet. Please contact support.",
      };
    }
    return { error: "Failed to upload image. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("students")
    .update({ avatar_url: publicUrl })
    .eq("user_id", user.id);

  if (updateError) {
    return { error: "Image uploaded but failed to update profile." };
  }

  return { data: { url: publicUrl } };
}

export async function changePassword(
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  const currentPassword = formData.get("current_password") as string;
  const newPassword = formData.get("new_password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!currentPassword) {
    return { error: "Current password is required." };
  }

  if (!newPassword || newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { error: "You must be logged in." };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { error: "Failed to update password. Please try again." };
  }

  return { data: { updated: true } };
}
