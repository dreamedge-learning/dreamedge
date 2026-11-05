import type { AdminRole } from "@/lib/auth-guard";
import { absoluteUrl } from "@/lib/site";

/**
 * Course completion certificates: the rules the admin panel, the student
 * dashboard and the public certificate page all have to agree on.
 *
 * Kept free of server imports so client components can read the same role
 * lists and formatting that the server actions enforce. The database checks
 * the roles again inside each function, so these lists decide what is shown,
 * not what is allowed.
 */

export type CertificateStatus = "pending" | "issued" | "rejected" | "revoked";

export const CERTIFICATE_STATUSES: CertificateStatus[] = [
  "pending",
  "issued",
  "rejected",
  "revoked",
];

/** Who sees the Certificates page at all. Support staff see, but cannot act. */
export const CERTIFICATE_VIEW_ROLES: AdminRole[] = [
  "super_admin",
  "teacher",
  "support_staff",
];

/** Who may approve or reject a request (`approve_certificates`, `reject_certificate`). */
export const CERTIFICATE_DECIDE_ROLES: AdminRole[] = ["super_admin", "teacher"];

/** Who may withdraw an issued certificate (`revoke_certificate`). */
export const CERTIFICATE_REVOKE_ROLES: AdminRole[] = ["super_admin"];

/** What the signatory defaults to until Settings says otherwise. Same as the SQL. */
export const DEFAULT_SIGNATORY_NAME = "Director";
export const DEFAULT_SIGNATORY_TITLE = "Dream Edge Online";

export function isCertificateStatus(value: unknown): value is CertificateStatus {
  return (
    typeof value === "string" &&
    (CERTIFICATE_STATUSES as string[]).includes(value)
  );
}

/**
 * The verification code as stored: upper case, letters and digits only.
 * Accepts what people actually type off paper -- lower case, dashes, spaces.
 */
export function normaliseVerificationCode(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** `7KQ2M9XD4TRP` to `7KQ2-M9XD-4TRP`, the form printed and linked. */
export function formatVerificationCode(code: string): string {
  const clean = normaliseVerificationCode(code);
  return clean.match(/.{1,4}/g)?.join("-") ?? clean;
}

/** Site-relative path of the public certificate page. */
export function certificatePath(code: string): string {
  return `/certificate/${formatVerificationCode(code)}`;
}

/** Absolute URL, for printing on the certificate and for sharing. */
export function certificateUrl(code: string): string {
  return absoluteUrl(certificatePath(code));
}

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  pending: "Awaiting approval",
  issued: "Issued",
  rejected: "Not approved",
  revoked: "Revoked",
};

const issuedDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** "5 November 2026", in India time whatever the server's clock says. */
export function formatCertificateDate(iso: string): string {
  return issuedDateFormatter.format(new Date(iso));
}
