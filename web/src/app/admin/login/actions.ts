"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

export async function signIn(formData: FormData) {
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

  // Lockout is checked server-side against the database rather than an
  // in-process counter: on serverless every request may land on a cold
  // instance, so an in-memory counter provides no protection at all.
  const { data: gate } = await supabase.rpc("admin_login_blocked", {
    p_email: email,
    p_ip: ip,
  });

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
    await supabase.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
    // Deliberately identical for unknown account and wrong password, so the
    // form cannot be used to enumerate which emails are admins.
    return { error: "Invalid email or password." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    await supabase.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
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
    await supabase.rpc("record_admin_login_attempt", {
      p_email: email,
      p_ip: ip,
      p_succeeded: false,
    });
    return { error: "You do not have admin access." };
  }

  await supabase.rpc("record_admin_login_attempt", {
    p_email: email,
    p_ip: ip,
    p_succeeded: true,
  });

  // Written through a scoped SECURITY DEFINER function: the role model lets
  // only super_admin UPDATE admin_users, and a blanket self-update policy would
  // let any admin rewrite their own role_id, since RLS cannot restrict columns.
  await supabase.rpc("touch_admin_last_login");

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
