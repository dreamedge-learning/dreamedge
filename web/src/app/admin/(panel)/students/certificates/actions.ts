"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import {
  CERTIFICATE_DECIDE_ROLES,
  CERTIFICATE_REVOKE_ROLES,
  CERTIFICATE_VIEW_ROLES,
  type CertificateStatus,
} from "@/lib/certificates";
import { adminAccessToken, dispatchPush } from "@/lib/push";
import { sanitizeSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

/**
 * The certificate queue: requests filed automatically when a student finishes
 * a course, and the decisions an admin makes on them.
 *
 * Every decision is a database function (`approve_certificates`,
 * `reject_certificate`, `revoke_certificate`) that checks the caller's role
 * itself and keeps the number, the frozen names and the student's inbox row in
 * one transaction. The role checks here only turn a refusal into a readable
 * message before the round trip.
 */

export interface AdminCertificateRow {
  id: string;
  status: CertificateStatus;
  certificate_number: string | null;
  verification_code: string;
  requested_at: string;
  issued_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  /** Frozen at issue; null until then. */
  student_name: string | null;
  course_title: string | null;
  student: {
    id: string;
    full_name: string;
    student_code: string | null;
    class: string | null;
  } | null;
  course: { id: string; title: string } | null;
  /** Visible to super admin only: admin_users is not readable by other roles. */
  issued_by_name: string | null;
  /** Whole days since the request was filed, worked out when the page loaded. */
  waiting_days: number;
}

export interface CertificateCounts {
  pending: number;
  issued: number;
  rejected: number;
  revoked: number;
}

const listFilterSchema = z.object({
  status: z.enum(["pending", "issued", "rejected", "revoked"]),
  search: z.string().max(120, "Search term is too long.").optional(),
  courseId: uuid("Course").optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type CertificateListFilters = z.input<typeof listFilterSchema>;

const CERTIFICATE_SELECT = `id, status, certificate_number, verification_code,
  requested_at, issued_at, rejected_at, rejected_reason, revoked_at,
  revoked_reason, student_name, course_title,
  student:students!inner(id, full_name, student_code, class),
  course:courses(id, title),
  issuer:admin_users!certificates_issued_by_fkey(full_name)`;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function fetchCertificates(filters: CertificateListFilters) {
  try {
    await assertAdmin([...CERTIFICATE_VIEW_ROLES]);

    const parsed = listFilterSchema.safeParse(filters);
    if (!parsed.success) {
      return { data: [] as AdminCertificateRow[], count: 0, error: firstIssue(parsed.error) };
    }

    const { status, search, courseId, page, pageSize } = parsed.data;
    const from = (page - 1) * pageSize;
    const supabase = await createClient();

    // The pending queue is worked oldest first, like any queue; the other
    // tabs are records, read newest first.
    const orderColumn =
      status === "pending"
        ? "requested_at"
        : status === "issued"
          ? "issued_at"
          : status === "rejected"
            ? "rejected_at"
            : "revoked_at";

    let query = supabase
      .from("certificates")
      .select(CERTIFICATE_SELECT, { count: "exact" })
      .eq("status", status)
      .order(orderColumn, { ascending: status === "pending" })
      .order("id", { ascending: true });

    if (courseId) query = query.eq("course_id", courseId);

    if (search) {
      const safe = sanitizeSearch(search);
      if (safe.length > 0) {
        query = query.or(
          `full_name.ilike.%${safe}%,student_code.ilike.%${safe}%`,
          { referencedTable: "students" }
        );
      }
    }

    const { data, count, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      console.error("fetchCertificates failed:", error);
      return { data: [] as AdminCertificateRow[], count: 0, error: "Could not load certificates." };
    }

    const now = Date.now();
    const rows: AdminCertificateRow[] = (data ?? []).map((row) => ({
      id: row.id,
      status: row.status as CertificateStatus,
      certificate_number: row.certificate_number,
      verification_code: row.verification_code,
      requested_at: row.requested_at,
      issued_at: row.issued_at,
      rejected_at: row.rejected_at,
      rejected_reason: row.rejected_reason,
      revoked_at: row.revoked_at,
      revoked_reason: row.revoked_reason,
      student_name: row.student_name,
      course_title: row.course_title,
      student: one(row.student),
      course: one(row.course),
      issued_by_name: one(row.issuer)?.full_name ?? null,
      waiting_days: Math.max(
        0,
        Math.floor((now - Date.parse(row.requested_at)) / 86_400_000)
      ),
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch (err) {
    console.error("fetchCertificates failed:", err);
    return { data: [] as AdminCertificateRow[], count: 0, error: describeFailure(err) };
  }
}

/** How many requests sit in each tab, for the tab badges. */
export async function fetchCertificateCounts(): Promise<CertificateCounts> {
  const empty: CertificateCounts = { pending: 0, issued: 0, rejected: 0, revoked: 0 };

  try {
    await assertAdmin([...CERTIFICATE_VIEW_ROLES]);
    const supabase = await createClient();

    const statuses: CertificateStatus[] = ["pending", "issued", "rejected", "revoked"];
    const results = await Promise.all(
      statuses.map((status) =>
        supabase
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("status", status)
      )
    );

    const counts = { ...empty };
    statuses.forEach((status, index) => {
      counts[status] = results[index].count ?? 0;
    });
    return counts;
  } catch (err) {
    console.error("fetchCertificateCounts failed:", err);
    return empty;
  }
}

const approveSchema = z.object({
  ids: z
    .array(uuid("Certificate"))
    .min(1, "Select at least one request.")
    .max(200, "Approve at most 200 at a time."),
});

/**
 * Issues the selected requests. Rows that are no longer pending (approved by
 * someone else a moment ago, say) are skipped by the database rather than
 * issued twice, and the count returned says how many actually went out.
 */
export async function approveCertificates(ids: string[]) {
  try {
    const { adminUser } = await assertAdmin([...CERTIFICATE_DECIDE_ROLES]);

    const parsed = approveSchema.safeParse({ ids });
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("approve_certificates", {
      p_ids: parsed.data.ids,
    });

    if (error) {
      console.error("approveCertificates failed:", error);
      return { error: "Could not issue those certificates. Please try again." };
    }

    const issued = data ?? [];

    if (issued.length > 0) {
      await supabase.from("audit_log").insert(
        issued.map((row) => ({
          user_id: adminUser.user_id,
          action: "approve",
          entity_type: "certificate",
          entity_id: row.certificate_id,
          new_data: { status: "issued" },
          metadata: { student_id: row.student_id },
        }))
      );

      // The inbox rows are already written. The pushes go out after the
      // response so a bulk approval is not held up by FCM, and stop at the
      // first sign that pushing is impossible -- FCM not set up yet, or a
      // role that may not push -- rather than repeating the same refusal
      // once per student.
      const accessToken = await adminAccessToken();
      if (accessToken) {
        const notificationIds = issued.map((row) => row.notification_id);
        after(() => pushInBatches(notificationIds, accessToken));
      }
    }

    revalidatePath("/admin/students/certificates");
    revalidatePath("/dashboard/certificates");

    return {
      issued: issued.length,
      skipped: parsed.data.ids.length - issued.length,
      error: null,
    };
  } catch (err) {
    console.error("approveCertificates failed:", err);
    return { error: describeFailure(err) };
  }
}

async function pushInBatches(notificationIds: string[], accessToken: string) {
  const BATCH = 10;

  for (let start = 0; start < notificationIds.length; start += BATCH) {
    const outcomes = await Promise.all(
      notificationIds
        .slice(start, start + BATCH)
        .map((id) => dispatchPush(id, accessToken))
    );

    if (outcomes.some((outcome) => outcome.notConfigured || outcome.forbidden)) {
      return;
    }
  }
}

const decisionSchema = z.object({
  id: uuid("Certificate"),
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason of at least a few words.")
    .max(500, "Keep the reason under 500 characters."),
});

/** Turns a request down. The student sees the reason on their certificates page. */
export async function rejectCertificate(id: string, reason: string) {
  try {
    const { adminUser } = await assertAdmin([...CERTIFICATE_DECIDE_ROLES]);

    const parsed = decisionSchema.safeParse({ id, reason });
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { error } = await supabase.rpc("reject_certificate", {
      p_id: parsed.data.id,
      p_reason: parsed.data.reason,
    });

    if (error) {
      console.error("rejectCertificate failed:", error);
      return {
        error:
          error.code === "P0002"
            ? "That request has already been decided."
            : "Could not reject that request. Please try again.",
      };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "reject",
      entity_type: "certificate",
      entity_id: parsed.data.id,
      new_data: { status: "rejected", reason: parsed.data.reason },
    });

    revalidatePath("/admin/students/certificates");
    revalidatePath("/dashboard/certificates");
    return { error: null };
  } catch (err) {
    console.error("rejectCertificate failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Withdraws an issued certificate. Its public page stays up and says so, which
 * is the point: somebody checking it after it was revoked must find out. The
 * page reads the database on every visit, so there is nothing to revalidate.
 */
export async function revokeCertificate(id: string, reason: string) {
  try {
    const { adminUser } = await assertAdmin([...CERTIFICATE_REVOKE_ROLES]);

    const parsed = decisionSchema.safeParse({ id, reason });
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();

    const { data: before } = await supabase
      .from("certificates")
      .select("certificate_number")
      .eq("id", parsed.data.id)
      .maybeSingle();

    const { error } = await supabase.rpc("revoke_certificate", {
      p_id: parsed.data.id,
      p_reason: parsed.data.reason,
    });

    if (error) {
      console.error("revokeCertificate failed:", error);
      return {
        error:
          error.code === "P0002"
            ? "Only an issued certificate can be revoked."
            : "Could not revoke that certificate. Please try again.",
      };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "revoke",
      entity_type: "certificate",
      entity_id: parsed.data.id,
      old_data: { status: "issued" },
      new_data: { status: "revoked", reason: parsed.data.reason },
      metadata: { certificate_number: before?.certificate_number ?? null },
    });

    revalidatePath("/admin/students/certificates");
    revalidatePath("/dashboard/certificates");
    return { error: null };
  } catch (err) {
    console.error("revokeCertificate failed:", err);
    return { error: describeFailure(err) };
  }
}
