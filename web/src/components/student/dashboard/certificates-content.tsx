"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Award,
  Ban,
  Check,
  Clock,
  ExternalLink,
  Link2,
  XCircle,
} from "lucide-react";

import type { StudentCertificate } from "@/app/(student)/dashboard/certificates/page";
import {
  CERTIFICATE_STATUS_LABELS,
  certificatePath,
  formatCertificateDate,
  type CertificateStatus,
} from "@/lib/certificates";

/**
 * The student's certificates.
 *
 * Issued ones first, because those are what the student came for; then the
 * ones still with the centre, so a student who has just finished a course can
 * see that something is happening rather than wondering whether it worked.
 */

const ORDER: Record<CertificateStatus, number> = {
  issued: 0,
  pending: 1,
  rejected: 2,
  revoked: 3,
};

export function CertificatesContent({
  certificates,
  loadFailed,
}: {
  certificates: StudentCertificate[];
  loadFailed: boolean;
}) {
  const sorted = [...certificates].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My certificates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete every lesson in a course and its certificate is requested for
          you. Your teacher approves it, and it appears here ready to print or
          share.
        </p>
      </header>

      {loadFailed ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Your certificates could not be loaded just now. Please refresh the page.
        </p>
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {sorted.map((certificate) => (
            <li key={certificate.id}>
              <CertificateCard certificate={certificate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Award className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-base font-semibold">No certificates yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Finish every lesson in one of your courses and your certificate request
        is sent automatically.
      </p>
      <Link
        href="/dashboard/my-courses"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
      >
        Continue learning
      </Link>
    </div>
  );
}

const STATUS_STYLES: Record<CertificateStatus, string> = {
  issued: "bg-emerald-500/10 text-emerald-400",
  pending: "bg-amber-500/10 text-amber-400",
  rejected: "bg-red-500/10 text-red-400",
  revoked: "bg-zinc-500/15 text-zinc-400",
};

const STATUS_ICONS: Record<CertificateStatus, React.ElementType> = {
  issued: Award,
  pending: Clock,
  rejected: XCircle,
  revoked: Ban,
};

function CertificateCard({ certificate }: { certificate: StudentCertificate }) {
  const [copied, setCopied] = useState(false);
  const Icon = STATUS_ICONS[certificate.status];
  const issued = certificate.status === "issued";
  const path = certificatePath(certificate.verificationCode);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", `${window.location.origin}${path}`);
    }
  }

  return (
    <article
      className={
        "rounded-xl border bg-card p-4 shadow-sm sm:p-5 " +
        (issued ? "border-[#C9A84C]/40" : "border-border")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
            (issued ? "bg-[#C9A84C]/15 text-[#C9A84C]" : "bg-muted text-muted-foreground")
          }
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug sm:text-base">
              {certificate.courseTitle}
            </p>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[certificate.status]}`}
            >
              {CERTIFICATE_STATUS_LABELS[certificate.status]}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            <StatusLine certificate={certificate} />
          </p>

          {certificate.status === "rejected" && certificate.rejectedReason && (
            <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground/90">
              {certificate.rejectedReason}
            </p>
          )}

          {issued && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
              >
                <ExternalLink className="h-4 w-4" />
                View and print
              </a>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                {copied ? "Link copied" : "Copy share link"}
              </button>
            </div>
          )}

          {certificate.status === "rejected" && (
            <Link
              href="/contact"
              className="mt-3 inline-flex text-sm font-medium text-brand-orange hover:underline"
            >
              Questions? Contact us
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusLine({ certificate }: { certificate: StudentCertificate }) {
  switch (certificate.status) {
    case "issued":
      return (
        <>
          {certificate.certificateNumber && (
            <span className="font-mono">{certificate.certificateNumber}</span>
          )}
          {certificate.issuedAt && (
            <>
              <span className="mx-1.5 text-muted-foreground/60">·</span>
              Issued {formatCertificateDate(certificate.issuedAt)}
            </>
          )}
        </>
      );
    case "pending":
      return (
        <>
          Course completed {formatCertificateDate(certificate.requestedAt)}. Your
          certificate is with the centre for approval.
        </>
      );
    case "rejected":
      return <>The centre did not approve this certificate:</>;
    default:
      return (
        <>
          This certificate was withdrawn
          {certificate.revokedAt ? ` on ${formatCertificateDate(certificate.revokedAt)}` : ""}
          . Contact the centre if you think this is a mistake.
        </>
      );
  }
}
