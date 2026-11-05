import { createClient } from "@/lib/supabase/server";

/**
 * Hands one `notifications` row to the `send-push` Edge Function.
 *
 * The function authorises the caller from the bearer token it is given, so
 * FCM dispatch is gated by the same role check as the admin screen that asked
 * for it. Callers pass the admin's own access token; there is deliberately no
 * service-role path, or a bug in any server action could push to every phone.
 *
 * A push is always a courtesy on top of the inbox row, which has already been
 * written by the time this runs, so every failure comes back as a value to
 * report rather than an exception to handle.
 */

export interface PushOutcome {
  sent?: number;
  failed?: number;
  pruned?: number;
  /** FCM_PROJECT_ID or FCM_SERVICE_ACCOUNT_JSON has not been set as a secret. */
  notConfigured?: boolean;
  /** The signed-in admin's role may not send pushes. */
  forbidden?: boolean;
  error?: string;
}

/** The signed-in admin's access token, or null when there is no session. */
export async function adminAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function dispatchPush(
  notificationId: string,
  accessToken: string
): Promise<PushOutcome> {
  try {
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
      }
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
      if (parsed.error === "push_not_configured") return { notConfigured: true };
      if (response.status === 403) return { forbidden: true };
      return {
        error:
          typeof parsed.error === "string"
            ? parsed.error
            : `Push dispatch failed (${response.status}).`,
      };
    }

    return {
      sent: toInt(parsed.sent),
      failed: toInt(parsed.failed),
      pruned: toInt(parsed.pruned),
    };
  } catch (err) {
    console.error("[dispatchPush] unexpected error:", err);
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
