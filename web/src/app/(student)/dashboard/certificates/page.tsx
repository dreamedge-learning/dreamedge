import type { Metadata } from "next";

import { CertificatesContent } from "@/components/student/dashboard/certificates-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { isCertificateStatus, type CertificateStatus } from "@/lib/certificates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My certificates",
};

/**
 * Every certificate this student has earned or is waiting on.
 *
 * Requests are filed by the database the moment the last lesson of a course
 * is completed, so this page only ever reads; the student has nothing to
 * apply for. Mirrors the app's Certificates screen.
 */

export interface StudentCertificate {
  id: string;
  status: CertificateStatus;
  courseTitle: string;
  courseSlug: string | null;
  certificateNumber: string | null;
  verificationCode: string;
  requestedAt: string;
  issuedAt: string | null;
  rejectedReason: string | null;
  revokedAt: string | null;
}

interface CertificateRow {
  id: string;
  status: string;
  certificate_number: string | null;
  verification_code: string;
  requested_at: string;
  issued_at: string | null;
  rejected_reason: string | null;
  revoked_at: string | null;
  course_title: string | null;
  course: { title: string; slug: string } | { title: string; slug: string }[] | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function CertificatesPage() {
  const student = await requireCompleteStudentProfile("/dashboard/certificates");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("certificates")
    .select(
      `id, status, certificate_number, verification_code, requested_at,
       issued_at, rejected_reason, revoked_at, course_title,
       course:courses(title, slug)`
    )
    .eq("student_id", student.id)
    .order("requested_at", { ascending: false });

  if (error) console.error("[certificates] could not be read:", error);

  const certificates: StudentCertificate[] = ((data ?? []) as unknown as CertificateRow[])
    .filter((row) => isCertificateStatus(row.status))
    .map((row) => {
      const course = one(row.course);
      return {
        id: row.id,
        status: row.status as CertificateStatus,
        // The title printed on the certificate, once there is one.
        courseTitle: row.course_title ?? course?.title ?? "Course",
        courseSlug: course?.slug ?? null,
        certificateNumber: row.certificate_number,
        verificationCode: row.verification_code,
        requestedAt: row.requested_at,
        issuedAt: row.issued_at,
        rejectedReason: row.rejected_reason,
        revokedAt: row.revoked_at,
      };
    });

  return <CertificatesContent certificates={certificates} loadFailed={!!error} />;
}
