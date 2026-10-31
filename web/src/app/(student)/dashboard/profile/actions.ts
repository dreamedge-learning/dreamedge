"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface ActionResult<T = Record<string, unknown>> {
  data?: T;
  error?: string;
}

export async function updateProfile(
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  const fullName = formData.get("full_name") as string;
  const phone = (formData.get("phone") as string) || null;
  const city = (formData.get("city") as string) || null;
  const state = (formData.get("state") as string) || null;

  if (!fullName || fullName.trim().length < 2) {
    return { error: "Full name must be at least 2 characters." };
  }

  if (fullName.trim().length > 100) {
    return { error: "Full name must be under 100 characters." };
  }

  if (phone && !/^\d{10}$/.test(phone)) {
    return { error: "Phone number must be 10 digits." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("students")
    .update({
      full_name: fullName.trim(),
      phone,
      city: city?.trim() || null,
      state: state || null,
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: "Failed to update profile. Please try again." };
  }

  return { data: { updated: true } };
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
