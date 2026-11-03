"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getSiteSettings } from "@/lib/settings";
import { RATE_LIMITS, describeRetryAfter, rateLimit } from "@/lib/rate-limit";

const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name").max(100),
  email: z.string().email("Please enter a valid email").max(254),
  phone: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  class: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  message: z
    .string()
    .min(10, "Please tell us a little more (10+ characters)")
    .max(2000),
});

export type ContactResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function submitContact(formData: FormData): Promise<ContactResult> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    class: formData.get("class"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string" && !fieldErrors[path]) {
        fieldErrors[path] = issue.message;
      }
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Read once, here: the address goes into three different failure messages,
  // and telling a stuck visitor to write to an inbox nobody reads any more is
  // the exact failure a hardcoded constant produces.
  const { support_email: supportEmail } = await getSiteSettings();

  const limit = await rateLimit({
    bucket: "contact",
    key: parsed.data.email.toLowerCase(),
    ...RATE_LIMITS.contact,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      error: `You have sent several messages already. Please try again ${describeRetryAfter(limit.retryAfter)}, or email ${supportEmail} directly.`,
    };
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("leads").insert({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      class: parsed.data.class,
      source: "contact_form",
      remarks: parsed.data.message,
      status: "new",
    });
    if (error) {
      console.error("[contact] insert failed", error);
      return {
        ok: false,
        error:
          `We couldn't record your message. Please try again, or email ${supportEmail}.`,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error("[contact] unexpected", e);
    return {
      ok: false,
      error:
        `Something went wrong on our end. Please try again, or email ${supportEmail}.`,
    };
  }
}
