"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import { adminApprovedEmail, adminRejectedEmail, sendEmail } from "@/lib/email";
import { getAdminSession } from "@/lib/admin";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ROLE_LABELS,
  applicationDecisionSchema,
  gateUpdateSchema,
  type ApplicableRole,
  type DocumentKind,
} from "@/lib/validations/admin-application";
import { describeFailure, firstIssue, formText } from "@/lib/validations/form";

/**
 * Reviewing admin applications, and the gate that produces them.
 *
 * Super admin only, throughout. `technical` owns integrations and logs and is
 * trusted with the system, but an application carries somebody else's ID proof
 * and phone number, which is a different kind of access.
 */

const REVIEW_ROLES = ["super_admin"] as const;
const BUCKET = "admin-documents";

export interface ApplicationDocumentRow {
  kind: DocumentKind;
  path: string;
  bytes: number;
  mime: string | null;
}

export interface AdminApplicationRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  qualification: string;
  institution: string | null;
  experience_years: number;
  subjects: string[];
  about: string | null;
  requested_role: ApplicableRole;
  status: "pending" | "approved" | "rejected";
  documents: ApplicationDocumentRow[];
  reviewed_at: string | null;
  decision_reason: string | null;
  created_at: string;
  reviewer_name: string | null;
}

export interface AdminGateStatus {
  is_set: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
}

const SELECT = `
  id, full_name, email, phone, qualification, institution, experience_years,
  subjects, about, requested_role, status, documents, reviewed_at,
  decision_reason, created_at,
  reviewed_by_admin:admin_users!admin_applications_reviewed_by_fkey(full_name)
`;

type Raw = {
  documents: unknown;
  subjects: string[] | null;
  reviewed_by_admin: { full_name: string } | null;
} & Omit<AdminApplicationRow, "documents" | "subjects" | "reviewer_name">;

function toRow(raw: Raw): AdminApplicationRow {
  return {
    ...raw,
    subjects: raw.subjects ?? [],
    documents: Array.isArray(raw.documents)
      ? (raw.documents as ApplicationDocumentRow[])
      : [],
    reviewer_name: raw.reviewed_by_admin?.full_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getAdminApplications(
  status: "pending" | "decided" | "all" = "all"
) {
  try {
    await assertAdmin([...REVIEW_ROLES]);
    const supabase = await createClient();

    let query = supabase
      .from("admin_applications")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status === "pending") query = query.eq("status", "pending");
    if (status === "decided") query = query.neq("status", "pending");

    const { data, error } = await query;

    if (error) {
      console.error("getAdminApplications failed:", error);
      return { data: [] as AdminApplicationRow[], error: "Could not load applications." };
    }

    return { data: (data ?? []).map((row) => toRow(row as unknown as Raw)) };
  } catch (err) {
    console.error("getAdminApplications failed:", err);
    return { data: [] as AdminApplicationRow[], error: describeFailure(err) };
  }
}

/**
 * The number on the sidebar badge.
 *
 * Counted from the table rather than kept in a notifications row, so it cannot
 * drift away from the queue it describes. Returns zero for every other role
 * instead of throwing, because the panel layout renders for all six.
 */
export async function countPendingApplications(): Promise<number> {
  try {
    const admin = await getAdminSession();
    if (!admin || admin.role_name !== "super_admin") return 0;

    const supabase = await createClient();
    const { count, error } = await supabase
      .from("admin_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) {
      console.error("countPendingApplications failed:", error);
      return 0;
    }

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * A short-lived URL for one attachment.
 *
 * Minted per click and never stored: the bucket is private, and a URL that
 * lives in the page source is a URL that outlives the session it was opened
 * in. Sixty seconds is enough to open a PDF and not much else.
 */
export async function getApplicationDocumentUrl(
  applicationId: string,
  kind: string
) {
  try {
    await assertAdmin([...REVIEW_ROLES]);
    const supabase = await createClient();

    const { data: application, error } = await supabase
      .from("admin_applications")
      .select("documents")
      .eq("id", applicationId)
      .single();

    if (error || !application) {
      return { error: "That application could not be found." };
    }

    const documents = Array.isArray(application.documents)
      ? (application.documents as unknown as ApplicationDocumentRow[])
      : [];

    // The path is taken from the row, not from the caller, so a crafted
    // argument cannot reach another object in the bucket.
    const match = documents.find((document) => document.kind === kind);

    if (!match) {
      return { error: "That document is not attached to this application." };
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(match.path, 60);

    if (signError || !signed) {
      console.error("getApplicationDocumentUrl failed:", signError);
      return { error: "Could not open that document." };
    }

    return { data: { url: signed.signedUrl } };
  } catch (err) {
    console.error("getApplicationDocumentUrl failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

/**
 * Finds the auth user behind an email and the set-password link in one call.
 *
 * `generateLink` with type `recovery` answers both questions at once, and
 * answers the first by failing, which is why a 404 is read rather than
 * treated as an error. The same shape the counter-registration path uses.
 *
 * `next` sends them to the admin sign-in page after they choose a password,
 * rather than to the student login they have no account for.
 */
async function recoveryLinkFor(email: string): Promise<{
  userId: string | null;
  link: string | null;
  unexpectedError?: string;
}> {
  const service = createServiceClient();

  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${SITE_URL}/auth/reset-password?next=${encodeURIComponent("/admin/login")}`,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    const notFound =
      error.status === 404 ||
      message.includes("not found") ||
      message.includes("no user");

    if (notFound) return { userId: null, link: null };

    console.error("[admin approval] generateLink failed:", error);
    return { userId: null, link: null, unexpectedError: error.message };
  }

  return {
    userId: data.user?.id ?? null,
    link: data.properties?.action_link ?? null,
  };
}

export async function approveApplication(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...REVIEW_ROLES]);

    const parsed = applicationDecisionSchema.safeParse({
      application_id: formText(formData, "application_id"),
      role: formText(formData, "role"),
      reason: formText(formData, "reason"),
    });

    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { application_id: applicationId, role, reason } = parsed.data;

    const supabase = await createClient();
    const service = createServiceClient();

    const { data: application, error: fetchError } = await supabase
      .from("admin_applications")
      .select("id, full_name, email, phone, status")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { error: "That application could not be found." };
    }

    if (application.status !== "pending") {
      return { error: "That application has already been decided." };
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("name", role)
      .single();

    if (roleError || !roleRow) {
      return { error: "That role no longer exists." };
    }

    const { data: alreadyAdmin } = await supabase
      .from("admin_users")
      .select("id")
      .ilike("email", application.email)
      .maybeSingle();

    if (alreadyAdmin) {
      return { error: "An admin account with this email already exists." };
    }

    // An auth user may already exist on this address -- an approved teacher
    // might also be a parent with a student account. Adopt it rather than
    // failing on an address that is already taken.
    const recovery = await recoveryLinkFor(application.email);

    if (recovery.unexpectedError) {
      return { error: "Could not check that email address. Please try again." };
    }

    let userId = recovery.userId;
    let passwordLink = recovery.link;
    const createdAuthUser = userId === null;

    if (!userId) {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: application.email,
        // Random and never disclosed: they set their own through the link.
        // Leaving the account passwordless would make the link the only way
        // in for good.
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { full_name: application.full_name },
      });

      if (createError || !created.user) {
        console.error("[admin approval] createUser failed:", createError);
        return { error: "Could not create their account. Please try again." };
      }

      userId = created.user.id;
      passwordLink = (await recoveryLinkFor(application.email)).link;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("admin_users")
      .insert({
        user_id: userId,
        full_name: application.full_name,
        email: application.email,
        phone: application.phone,
        role_id: roleRow.id,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[admin approval] admin_users insert failed:", insertError);
      // Only undo what this call created. An auth user that was already there
      // belongs to a student and must survive a failed approval.
      if (createdAuthUser) {
        await service.auth.admin.deleteUser(userId);
      }
      return { error: "Could not add them to the team. Please try again." };
    }

    const { error: updateError } = await supabase
      .from("admin_applications")
      .update({
        status: "approved",
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        decision_reason: reason ?? null,
        approved_admin_user_id: inserted.id,
      })
      .eq("id", applicationId)
      .eq("status", "pending");

    if (updateError) {
      console.error("[admin approval] could not close the application:", updateError);
      // The account exists and works; leaving the application open would only
      // invite a second approval, so this is reported rather than rolled back.
      return {
        error:
          "They were added to the team, but the application could not be marked "
          + "approved. Reload before approving anything else.",
      };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "approve",
      entity_type: "admin_application",
      entity_id: applicationId,
      new_data: {
        email: application.email,
        approved_as: role,
        admin_user_id: inserted.id,
        adopted_existing_auth_user: !createdAuthUser,
      },
    });

    let emailSent = false;
    if (passwordLink) {
      const message = adminApprovedEmail({
        fullName: application.full_name,
        roleLabel: ROLE_LABELS[role],
        link: passwordLink,
      });
      const outcome = await sendEmail({ to: application.email, ...message });
      emailSent = outcome.sent;
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin", "layout");

    return { data: { link: passwordLink, emailSent, roleLabel: ROLE_LABELS[role] } };
  } catch (err) {
    console.error("approveApplication failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function rejectApplication(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...REVIEW_ROLES]);

    const parsed = applicationDecisionSchema
      .omit({ role: true })
      .safeParse({
        application_id: formText(formData, "application_id"),
        reason: formText(formData, "reason"),
      });

    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { application_id: applicationId, reason } = parsed.data;
    const supabase = await createClient();

    const { data: application, error: fetchError } = await supabase
      .from("admin_applications")
      .select("id, full_name, email, status")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return { error: "That application could not be found." };
    }

    if (application.status !== "pending") {
      return { error: "That application has already been decided." };
    }

    const { error: updateError } = await supabase
      .from("admin_applications")
      .update({
        status: "rejected",
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        decision_reason: reason ?? null,
      })
      .eq("id", applicationId)
      .eq("status", "pending");

    if (updateError) {
      console.error("rejectApplication failed:", updateError);
      return { error: "Could not record that decision. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "reject",
      entity_type: "admin_application",
      entity_id: applicationId,
      new_data: { email: application.email, reason: reason ?? null },
    });

    const message = adminRejectedEmail({
      fullName: application.full_name,
      reason: reason ?? null,
    });
    const outcome = await sendEmail({ to: application.email, ...message });

    revalidatePath("/admin/settings");
    revalidatePath("/admin", "layout");

    return { data: { emailSent: outcome.sent } };
  } catch (err) {
    console.error("rejectApplication failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export async function getAdminGateStatus() {
  try {
    await assertAdmin([...REVIEW_ROLES]);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("admin_gate_status");

    if (error) {
      console.error("getAdminGateStatus failed:", error);
      return { data: null, error: "Could not read the gate status." };
    }

    const row = Array.isArray(data) ? data[0] : null;

    return {
      data: {
        is_set: row?.is_set ?? false,
        updated_at: row?.updated_at ?? null,
        updated_by_name: row?.updated_by_name ?? null,
      } satisfies AdminGateStatus,
    };
  } catch (err) {
    console.error("getAdminGateStatus failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function updateAdminGate(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin([...REVIEW_ROLES]);

    const parsed = gateUpdateSchema.safeParse({
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const supabase = await createClient();

    // Hashed inside the function, against a row no client can read. The length
    // rule is enforced there too, because this is not the only possible caller.
    const { error } = await supabase.rpc("set_admin_gate", {
      p_password: parsed.data.password,
    });

    if (error) {
      console.error("updateAdminGate failed:", error);
      return { error: "Could not save the access password. Please try again." };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update",
      entity_type: "admin_access_gate",
      // Deliberately no value, not even a redacted one.
      new_data: { rotated: true },
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch (err) {
    console.error("updateAdminGate failed:", err);
    return { error: describeFailure(err) };
  }
}
