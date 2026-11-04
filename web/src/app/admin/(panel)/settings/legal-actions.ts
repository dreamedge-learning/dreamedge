"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import { LEGAL_SLUGS, type LegalDocument } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import { legalDocumentInput, legalDocumentSchema } from "@/lib/validations/legal";

/**
 * The refund, privacy and terms pages, as editable rows.
 *
 * Super admin only, deliberately narrower than the rest of Settings: the
 * refund terms are a commitment to a paying customer, and `technical` is a
 * systems role. The table's RLS says the same thing, so a missed check here
 * is still refused by the database.
 */
const LEGAL_ROLES = ["super_admin"] as const;

export async function getLegalDocuments() {
  try {
    await assertAdmin([...LEGAL_ROLES]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("legal_documents")
      .select("slug, title, effective_date, body, updated_at")
      .order("slug");

    if (error) {
      console.error("getLegalDocuments failed:", error);
      return { data: [] as LegalDocument[], error: "Could not load the policy pages." };
    }

    return { data: (data ?? []) as LegalDocument[] };
  } catch (err) {
    console.error("getLegalDocuments failed:", err);
    return { data: [] as LegalDocument[], error: describeFailure(err) };
  }
}

export async function updateLegalDocument(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...LEGAL_ROLES]);

    const parsed = legalDocumentSchema.safeParse(legalDocumentInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { slug, title, effective_date: effectiveDate, body } = parsed.data;
    const supabase = await createClient();

    // The previous text is kept in the audit log rather than in a versions
    // table. It is the question somebody actually asks about a policy page --
    // "what did it say when they paid?" -- and the log already answers it for
    // every other admin action.
    const { data: before } = await supabase
      .from("legal_documents")
      .select("title, effective_date, body")
      .eq("slug", slug)
      .maybeSingle();

    const { error } = await supabase
      .from("legal_documents")
      .update({
        title,
        effective_date: new Date(effectiveDate).toISOString().slice(0, 10),
        body,
        updated_by: adminUser.id,
      })
      .eq("slug", slug);

    if (error) {
      console.error("updateLegalDocument failed:", error);
      return { error: "Could not save that policy. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update",
      entity_type: "legal_document",
      old_data: before ?? null,
      new_data: { title, effective_date: effectiveDate, body },
      metadata: { slug },
    });

    // The public page is dynamic, but revalidating is what makes a change show
    // on a cached route without waiting for one to expire.
    revalidatePath(`/${slug}`);
    revalidatePath("/admin/settings");

    return { error: null };
  } catch (err) {
    console.error("updateLegalDocument failed:", err);
    return { error: describeFailure(err) };
  }
}
