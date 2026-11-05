"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { billingProfileInput, billingProfileSchema } from "@/lib/validations/billing";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import type { Tables } from "@/types/supabase";

/**
 * The seller details printed on receipts, and the GST switch.
 *
 * Super admin only, like the policy pages: these are the business's legal
 * identity on a document a parent may hand to an auditor. The table's row
 * security says the same, so a missed check here is still refused.
 *
 * A change applies to receipts issued after it. Each receipt keeps a copy of
 * what it was issued with, so nothing already sent changes.
 */

export type BillingProfile = Tables<"billing_profile">;

const BILLING_ROLES = ["super_admin"] as const;

export async function getBillingProfile() {
  try {
    await assertAdmin([...BILLING_ROLES]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("billing_profile")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      console.error("getBillingProfile failed:", error);
      return { data: null, error: "Could not load the billing details." };
    }

    return { data: data as BillingProfile | null, error: null };
  } catch (err) {
    console.error("getBillingProfile failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function updateBillingProfile(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...BILLING_ROLES]);

    const parsed = billingProfileSchema.safeParse(billingProfileInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const input = parsed.data;
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("billing_profile")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    const values = {
      legal_name: input.legal_name,
      address: input.address,
      state: input.state,
      state_code: input.state_code,
      gst_registered: input.gst_registered,
      gstin: input.gstin ?? null,
      gst_rate: input.gst_rate,
      sac_code: input.sac_code,
      receipt_prefix: input.receipt_prefix,
      footer_note: input.footer_note ?? null,
      updated_by: adminUser.id,
    };

    const { error } = await supabase.from("billing_profile").update(values).eq("id", true);

    if (error) {
      console.error("updateBillingProfile failed:", error);
      return { error: "Could not save the billing details. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update",
      entity_type: "billing_profile",
      old_data: before ?? null,
      new_data: values,
      metadata: { gst_registered: input.gst_registered },
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch (err) {
    console.error("updateBillingProfile failed:", err);
    return { error: describeFailure(err) };
  }
}
