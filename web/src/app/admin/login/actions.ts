"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(320)
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.").max(200),
});

/**
 * Best-effort client address. Vercel sets x-forwarded-for; the left-most entry
 * is the original client. Used only for rate limiting, never for authorization.
 */
async function clientIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
    return h.get("x-real-ip") ?? undefined;
  } catch {
    return undefined;
  }
}

export type SignInState = { error: string } | null;

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password } = parsed.data;
  const ip = await clientIp();
  const supabase = await createClient();

  // The throttle RPCs are service-role only. EXECUTE on
  // admin_login_blocked and record_admin_login_attempt was revoked from
  // anon and authenticated in 20261103100000_rpc_exposure.sql, so the
  // request-scoped client (anonymous at the sign-in form) would get back
  // a permission error -- the earlier shape silently dropped it, which
  // meant the gate always passed and no failed attempt was ever recorded.
  // Both RPCs must go through the service client, and their errors must
  // be checked. The lockout check fails CLOSED: if we cannot ask the
  // database whether this address is throttled, we refuse the attempt
  // rather than wave it through.
  const admin = createServiceClient();

  const { data: gate, error: gateError } = await admin.rpc(
    "admin_login_blocked",
    { p_email: email, p_ip: ip },
  );

  if (gateError) {
    console.error("[admin login] lockout check failed", gateError);
    return {
      error: "Sign-in is temporarily unavailable. Please try again shortly.",
    };
  }

  const gateInfo = gate as { blocked?: boolean; retry_after_seconds?: number } | null;
  if (gateInfo?.blocked) {
    const minutes = Math.max(1, Math.ceil((gateInfo.retry_after_seconds ?? 900) / 60));
    return {
      error: `Too many failed attempts. Try again in about ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
    };
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    // Service client: see the comment above. The record is bookkeeping,
    // so a failure to write it is logged rather than returned -- but
    // logged, not dropped, so the next audit can see the gate working.
    const { error: recordError } = await admin.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
    if (recordError) {
      console.error("[admin login] attempt not recorded", recordError);
    }
    // Deliberately identical for unknown account and wrong password, so the
    // form cannot be used to enumerate which emails are admins.
    return { error: "Invalid email or password." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    // Service client: throttle RPC is service-role only.
    const { error: recordError } = await admin.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
    if (recordError) {
      console.error("[admin login] attempt not recorded", recordError);
    }
    return { error: "Authentication failed." };
  }

  // Credentials were valid, but this account may not be an admin at all.
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!adminUser) {
    await supabase.auth.signOut();
    // Service client: throttle RPC is service-role only. A non-admin
    // guessing passwords is the same attack as an admin guessing them.
    const { error: recordError } = await admin.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
    if (recordError) {
      console.error("[admin login] attempt not recorded", recordError);
    }
    return { error: "You do not have admin access." };
  }

  // Service client: throttle RPC is service-role only. A successful
  // attempt resets the counter, so this write matters just as much as
  // the failed ones.
  const { error: recordError } = await admin.rpc("record_admin_login_attempt", {
    p_email: email,
    p_ip: ip,
    p_succeeded: true,
  });
  if (recordError) {
    console.error("[admin login] attempt not recorded", recordError);
  }

  // Written through a scoped SECURITY DEFINER function: the role model lets
  // only super_admin UPDATE admin_users, and a blanket self-update policy would
  // let any admin rewrite their own role_id, since RLS cannot restrict columns.
  // Stays on the request-scoped client because the function derives the
  // target row from auth.uid(), which the service role does not have.
  await supabase.rpc("touch_admin_last_login");

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
