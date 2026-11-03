"use server";

import { revalidatePath } from "next/cache";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks one notification row as read for the current student.
 *
 * `student_notifications` carries one row per (student, notification), so a
 * student only marks their own row -- the admin's audit view and other
 * students' rows are untouched. RLS already restricts updates to the
 * student's own row; we also set it explicitly here to keep the intent
 * local to this action.
 */
export async function markNotificationRead(id: string): Promise<{
  error?: string;
}> {
  try {
    const student = await requireCompleteStudentProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("student_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("student_id", student.id);

    if (error) {
      console.error("[markNotificationRead] failed:", error);
      return { error: "Could not update that notification." };
    }

    revalidatePath("/dashboard/notifications");
    return {};
  } catch (err) {
    console.error("[markNotificationRead] unexpected:", err);
    return { error: "Could not update that notification." };
  }
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  try {
    const student = await requireCompleteStudentProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("student_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("student_id", student.id)
      .eq("is_read", false);

    if (error) {
      console.error("[markAllNotificationsRead] failed:", error);
      return { error: "Could not update your notifications." };
    }

    revalidatePath("/dashboard/notifications");
    return {};
  } catch (err) {
    console.error("[markAllNotificationsRead] unexpected:", err);
    return { error: "Could not update your notifications." };
  }
}
