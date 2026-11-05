"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import {
  bannerIdSchema,
  bannerInput,
  bannerSchema,
  notificationIdSchema,
  notificationInput,
  notificationSchema,
} from "@/lib/validations/engage";

const ENGAGE_ROLES = ["super_admin", "support_staff"] as const;

/**
 * Channels that write to `student_notifications` -- that table is what the
 * in-app inbox reads on both platforms. `in_app` is the obvious one; `push`
 * also fans out here because a push notification should land in the inbox
 * too, so a student who taps-dismisses a push can still find the message.
 *
 * `email` and `sms` are left out until Resend and the SMS provider are
 * wired up; the UI says as much.
 */
const INBOX_CHANNELS = new Set(["in_app", "push"]);

/**
 * Channels that invoke the `send-push` Edge Function. The function
 * returns 503 with `push_not_configured` when the FCM project id or
 * service account secret is missing, which we surface to the sender
 * rather than pretending the push went out.
 */
const PUSH_CHANNELS = new Set(["push"]);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function fetchNotifications(limit = 50) {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, message, channel, target_type, target_id, course_id, action_url, thumbnail_url, sent_at")
      // "Your doubt has been answered" notices are sent one per teacher reply
      // and live in the Doubts inbox; listing them here would bury the
      // broadcasts this log is for.
      .neq("target_type", "doubt")
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("fetchNotifications failed:", error);
      return { error: "Could not load notifications." };
    }

    // One grouped count per notification beats a query per row.
    const ids = (data ?? []).map((n) => n.id);
    const recipients = new Map<string, number>();

    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from("student_notifications")
        .select("notification_id")
        .in("notification_id", ids);

      for (const row of rows ?? []) {
        recipients.set(
          row.notification_id,
          (recipients.get(row.notification_id) ?? 0) + 1
        );
      }
    }

    return {
      data: (data ?? []).map((n) => ({
        ...n,
        recipient_count: recipients.get(n.id) ?? 0,
      })),
    };
  } catch (err) {
    console.error("fetchNotifications failed:", err);
    return { error: describeFailure(err) };
  }
}

/** Courses and students, for the "send to" pickers. */
export async function fetchNotificationTargets() {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const [courses, students] = await Promise.all([
      supabase.from("courses").select("id, title").order("title"),
      supabase.from("students").select("id, full_name, email").order("full_name").limit(500),
    ]);

    return {
      data: {
        courses: courses.data ?? [],
        students: students.data ?? [],
      },
    };
  } catch (err) {
    console.error("fetchNotificationTargets failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function sendNotification(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsed = notificationSchema.safeParse(notificationInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const values = parsed.data;
    const courseId = values.target_type === "course" ? values.course_id : null;
    const studentId = values.target_type === "student" ? values.target_id : null;

    const { data: created, error } = await supabase
      .from("notifications")
      .insert({
        title: values.title,
        message: values.message,
        channel: values.channel,
        action_url: values.action_url ?? null,
        thumbnail_url: values.thumbnail_url ?? null,
        target_type: values.target_type,
        target_id: studentId,
        course_id: courseId,
        sent_by: adminUser.id,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("sendNotification failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    let recipientCount = 0;
    let pushResult: {
      sent?: number;
      failed?: number;
      pruned?: number;
      notConfigured?: boolean;
      error?: string;
    } | null = null;

    if (INBOX_CHANNELS.has(values.channel)) {
      const recipientIds = await resolveRecipients(supabase, values.target_type, {
        courseId,
        studentId,
      });

      if (recipientIds.length > 0) {
        const { error: fanoutError } = await supabase
          .from("student_notifications")
          .insert(
            recipientIds.map((id) => ({
              student_id: id,
              notification_id: created.id,
            }))
          );

        if (fanoutError) {
          // The notification row exists but reached nobody. Removing it keeps
          // the log honest rather than showing a send that silently delivered
          // to zero students.
          console.error("sendNotification fan-out failed:", fanoutError);
          await supabase.from("notifications").delete().eq("id", created.id);
          return { error: "Could not deliver to students. Nothing was sent." };
        }
      }

      recipientCount = recipientIds.length;
    }

    if (PUSH_CHANNELS.has(values.channel)) {
      // Fire the Edge Function. The inbox row already exists, so a push
      // failure is a delivery warning, not a lost send.
      pushResult = await invokeSendPush(created.id);
    }

    revalidatePath("/admin/engage");
    return {
      success: true,
      recipientCount,
      channel: values.channel,
      push: pushResult,
    };
  } catch (err) {
    console.error("sendNotification failed:", err);
    return { error: describeFailure(err) };
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * POSTs to the `send-push` Edge Function with the admin's own JWT, so FCM
 * dispatch is gated by the same role check the admin UI already enforces.
 *
 * Returns a readable summary for the UI. `notConfigured` is the one
 * failure the sender can act on -- it means the Firebase project id and
 * service account have not been uploaded as Supabase secrets yet, so the
 * push did not go out even though the inbox row did.
 */
async function invokeSendPush(
  notificationId: string,
): Promise<{
  sent?: number;
  failed?: number;
  pruned?: number;
  notConfigured?: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.access_token;
    if (!accessToken) return { error: "No session." };

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey) {
      return { error: "Push service is not configured." };
    }

    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/functions/v1/send-push`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ notification_id: notificationId }),
      },
    );

    const raw = await response.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Non-JSON body -- treated as a generic failure below.
      }
    }

    if (!response.ok) {
      if (parsed.error === "push_not_configured") {
        return { notConfigured: true };
      }
      return { error: typeof parsed.error === "string" ? parsed.error : `Push dispatch failed (${response.status}).` };
    }

    return {
      sent: toInt(parsed.sent),
      failed: toInt(parsed.failed),
      pruned: toInt(parsed.pruned),
    };
  } catch (err) {
    console.error("[invokeSendPush] unexpected error:", err);
    return { error: "Could not reach the push service." };
  }
}

function toInt(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function resolveRecipients(
  supabase: SupabaseClient,
  targetType: string,
  { courseId, studentId }: { courseId: string | null; studentId: string | null }
): Promise<string[]> {
  if (targetType === "student" && studentId) {
    return [studentId];
  }

  if (targetType === "course" && courseId) {
    const { data } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .eq("status", "active");
    return Array.from(new Set((data ?? []).map((e) => e.student_id)));
  }

  const { data } = await supabase.from("students").select("id").eq("status", "active");
  return (data ?? []).map((s) => s.id);
}

export async function deleteNotification(id: string) {
  try {
    await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsedId = notificationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase.from("notifications").delete().eq("id", parsedId.data);

    if (error) {
      console.error("deleteNotification failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/engage");
    return { success: true };
  } catch (err) {
    console.error("deleteNotification failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export async function fetchBanners() {
  try {
    await assertAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("banners")
      .select("id, title, image_url, action_url, position, is_active, weight, starts_at, ends_at, created_at")
      .order("position")
      .order("weight");

    if (error) {
      console.error("fetchBanners failed:", error);
      return { error: "Could not load banners." };
    }

    return { data: data ?? [] };
  } catch (err) {
    console.error("fetchBanners failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function createBanner(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsed = bannerSchema.safeParse(bannerInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { count } = await supabase
      .from("banners")
      .select("id", { count: "exact", head: true })
      .eq("position", parsed.data.position);

    const { error } = await supabase.from("banners").insert({
      title: parsed.data.title,
      image_url: parsed.data.image_url,
      action_url: parsed.data.action_url ?? null,
      position: parsed.data.position,
      starts_at: parsed.data.starts_at ?? null,
      ends_at: parsed.data.ends_at ?? null,
      is_active: true,
      weight: (count ?? 0) + 1,
      created_by: adminUser.id,
    });

    if (error) {
      console.error("createBanner failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/engage/banners");
    return { success: true };
  } catch (err) {
    console.error("createBanner failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateBanner(id: string, formData: FormData) {
  try {
    await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsedId = bannerIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = bannerSchema.safeParse(bannerInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase
      .from("banners")
      .update({
        title: parsed.data.title,
        image_url: parsed.data.image_url,
        action_url: parsed.data.action_url ?? null,
        position: parsed.data.position,
        starts_at: parsed.data.starts_at ?? null,
        ends_at: parsed.data.ends_at ?? null,
      })
      .eq("id", parsedId.data);

    if (error) {
      console.error("updateBanner failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/engage/banners");
    return { success: true };
  } catch (err) {
    console.error("updateBanner failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function toggleBannerActive(id: string, isActive: boolean) {
  try {
    await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsedId = bannerIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("banners")
      .update({ is_active: isActive })
      .eq("id", parsedId.data);

    if (error) {
      console.error("toggleBannerActive failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/engage/banners");
    return { success: true };
  } catch (err) {
    console.error("toggleBannerActive failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteBanner(id: string) {
  try {
    await assertAdmin([...ENGAGE_ROLES]);
    const supabase = await createClient();

    const parsedId = bannerIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase.from("banners").delete().eq("id", parsedId.data);

    if (error) {
      console.error("deleteBanner failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/engage/banners");
    return { success: true };
  } catch (err) {
    console.error("deleteBanner failed:", err);
    return { error: describeFailure(err) };
  }
}
