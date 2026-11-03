"use server";

import { headers } from "next/headers";

import { hasGatePass, issueGatePass } from "@/lib/admin-gate";
import { sendEmail, adminApplicationEmail } from "@/lib/email";
import { RATE_LIMITS, describeRetryAfter, rateLimit } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ALLOWED_DOCUMENT_MIMES,
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  ROLE_LABELS,
  adminApplicationInput,
  adminApplicationSchema,
  gatePasswordSchema,
  type DocumentKind,
} from "@/lib/validations/admin-application";
import { firstIssue } from "@/lib/validations/form";

/**
 * The public side of admin signup.
 *
 * Everything here runs for a signed-out visitor, which shapes all three
 * actions: the database work goes through the service client because there is
 * no session to carry policy, and every step re-checks the gate rather than
 * trusting that the previous one did.
 */

const BUCKET = "admin-documents";

/** Extensions are derived from the type we accepted, never from the filename. */
const EXTENSION_FOR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const INCOMING_PATH = /^incoming\/[0-9a-f-]{36}\/(cv|degree|id_proof)\.(pdf|jpg|png|webp)$/;

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return h.get("x-real-ip")?.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type GateState = { error: string } | { unlocked: true } | null;

export async function unlockApplicationForm(
  _prevState: GateState,
  formData: FormData
): Promise<GateState> {
  const parsed = gatePasswordSchema.safeParse(formData.get("password"));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  // Throttled on the address alone: there is no account to scope to, and one
  // shared password is only as strong as the number of guesses allowed.
  const limit = await rateLimit({ bucket: "adminGate", ...RATE_LIMITS.adminGate });

  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("verify_admin_gate", {
    p_password: parsed.data,
  });

  // Fails closed. If the check itself is broken we refuse rather than open the
  // form, the same way the admin sign-in lockout does.
  if (error) {
    console.error("[admin apply] gate check failed:", error);
    return { error: "This form is unavailable right now. Please try again shortly." };
  }

  if (data !== true) {
    return { error: "That access password is not correct." };
  }

  await issueGatePass();
  return { unlocked: true };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * A signed URL the browser uploads to directly.
 *
 * Signed here rather than posted through this action because a server action
 * body is capped well below the bucket's 10 MB, and because the key is chosen
 * on this side: a visitor who picked their own key could write anywhere in the
 * bucket, including over somebody else's certificate.
 */
export async function createApplicationUploadTicket(
  kind: string,
  sizeBytes: number,
  mimeType: string
) {
  if (!(await hasGatePass())) {
    return { error: "Your access window expired. Enter the access password again." };
  }

  if (!DOCUMENT_KINDS.includes(kind as DocumentKind)) {
    return { error: "That is not a document we ask for." };
  }

  const extension = EXTENSION_FOR_MIME[mimeType];
  if (!extension || !ALLOWED_DOCUMENT_MIMES.includes(mimeType as (typeof ALLOWED_DOCUMENT_MIMES)[number])) {
    return { error: "Attach a PDF, JPG, PNG or WebP file." };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { error: "That file looks empty." };
  }

  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    return { error: "Each file must be under 10 MB." };
  }

  const path = `incoming/${crypto.randomUUID()}/${kind}.${extension}`;
  const service = createServiceClient();

  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[admin apply] upload ticket failed:", error);
    return { error: "Could not start the upload. Please try again." };
  }

  return { data: { path: data.path, signedUrl: data.signedUrl } };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export type SubmitState =
  | { error: string }
  | { submitted: true; reference: string }
  | null;

export async function submitAdminApplication(
  _prevState: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  if (!(await hasGatePass())) {
    return { error: "Your access window expired. Enter the access password again." };
  }

  const parsed = adminApplicationSchema.safeParse(adminApplicationInput(formData));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const values = parsed.data;

  const limit = await rateLimit({
    bucket: "adminApply",
    key: values.email,
    ...RATE_LIMITS.adminApply,
  });

  if (!limit.allowed) {
    return {
      error: `You have already applied a few times. Try again ${describeRetryAfter(limit.retryAfter)}.`,
    };
  }

  const service = createServiceClient();

  // Said plainly rather than left to the unique index, which would surface as
  // a constraint name. Checked before anything is moved or written.
  const { data: existing } = await service
    .from("admin_applications")
    .select("id")
    .eq("status", "pending")
    .ilike("email", values.email)
    .maybeSingle();

  if (existing) {
    return {
      error: "An application from this email is already waiting to be reviewed.",
    };
  }

  const { data: alreadyAdmin } = await service
    .from("admin_users")
    .select("id")
    .ilike("email", values.email)
    .maybeSingle();

  if (alreadyAdmin) {
    return {
      error: "This email already has a Dream Edge team account. Sign in instead.",
    };
  }

  const applicationId = crypto.randomUUID();

  // The uploads landed under `incoming/` with keys this server chose. They are
  // moved into the application's own folder before the row exists, so a stored
  // path always points at a file that belongs to that application.
  const documents: { kind: DocumentKind; path: string; bytes: number; mime: string | null }[] = [];
  const moved: string[] = [];

  for (const doc of values.documents) {
    if (!INCOMING_PATH.test(doc.path)) {
      await removeObjects(moved);
      return { error: "One of the attachments could not be read. Please attach it again." };
    }

    const extension = doc.path.slice(doc.path.lastIndexOf(".") + 1);
    const destination = `applications/${applicationId}/${doc.kind}.${extension}`;

    const { error: moveError } = await service.storage.from(BUCKET).move(doc.path, destination);

    if (moveError) {
      console.error("[admin apply] could not file an attachment:", moveError);
      await removeObjects(moved);
      return { error: "One of the attachments could not be saved. Please try again." };
    }

    moved.push(destination);
    documents.push({ kind: doc.kind, path: destination, bytes: doc.bytes, mime: doc.mime });
  }

  const { error: insertError } = await service.from("admin_applications").insert({
    id: applicationId,
    full_name: values.full_name,
    email: values.email,
    phone: values.phone,
    qualification: values.qualification,
    institution: values.institution ?? null,
    experience_years: values.experience_years,
    subjects: values.subjects,
    about: values.about ?? null,
    requested_role: values.requested_role,
    documents,
    submitted_ip: await clientIp(),
  });

  if (insertError) {
    console.error("[admin apply] insert failed:", insertError);
    // The files are already in the bucket and nothing can reach them without
    // the row, so they would be orphans nobody can see or remove.
    await removeObjects(moved);
    return { error: "Something went wrong. Please try again." };
  }

  await notifySuperAdmins(values.full_name, values.requested_role, values.experience_years);

  // The first eight characters are enough for the applicant to quote and for
  // the panel's search to find, without handing out the whole key.
  return { submitted: true, reference: applicationId.slice(0, 8).toUpperCase() };
}

async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const service = createServiceClient();
  const { error } = await service.storage.from(BUCKET).remove(paths);

  if (error) {
    console.error("[admin apply] could not clean up attachments:", error, paths);
  }
}

/**
 * Tells every active super admin that somebody applied.
 *
 * Best effort: a mail that does not leave must not fail the application. The
 * badge in the panel is derived from the table itself, so the queue is still
 * correct even when this does nothing -- which it does today, because
 * `RESEND_API_KEY` is not configured.
 */
async function notifySuperAdmins(
  applicantName: string,
  role: keyof typeof ROLE_LABELS,
  experienceYears: number
): Promise<void> {
  try {
    const service = createServiceClient();

    const { data: recipients } = await service
      .from("admin_users")
      .select("email, roles!inner(name)")
      .eq("is_active", true)
      .eq("roles.name", "super_admin");

    if (!recipients || recipients.length === 0) return;

    const message = adminApplicationEmail({
      applicantName,
      roleLabel: ROLE_LABELS[role],
      experienceYears,
      link: absoluteUrl("/admin/settings?tab=applications"),
    });

    await Promise.all(
      recipients.map((recipient) =>
        sendEmail({ to: recipient.email, subject: message.subject, html: message.html })
      )
    );
  } catch (error) {
    console.error("[admin apply] could not notify super admins:", error);
  }
}
