import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import {
  certificatePath,
  certificateUrl,
  formatCertificateDate,
  formatVerificationCode,
  normaliseVerificationCode,
} from "@/lib/certificates";
import { SITE_NAME } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

import { CertificateActions } from "./certificate-actions";

/**
 * A course certificate, and the page that proves it is real.
 *
 * Public on purpose: the link is what a student hands to a school or puts on
 * a profile, and whoever opens it has no account. Everything shown comes from
 * `verify_certificate`, which returns only what the certificate itself prints
 * and only for a certificate that was actually issued -- a pending or rejected
 * request looks exactly like a code that never existed.
 *
 * The code is 60 random bits, so the URL is the secret; the page is kept out
 * of search engines so that a list of students' names never becomes
 * something one can search for.
 *
 * Always paper-white, whatever the site's theme: this is a document to print,
 * and a dark certificate prints as a block of toner.
 */

interface PageProps {
  params: Promise<{ code: string }>;
}

interface VerifiedCertificate {
  certificate_number: string;
  student_name: string;
  course_title: string;
  signatory_name: string | null;
  signatory_title: string | null;
  issued_at: string;
  revoked_at: string | null;
  status: string;
  verification_code: string;
}

const CODE_SHAPE = /^[0-9A-Z]{12}$/;

const loadCertificate = cache(async (raw: string): Promise<VerifiedCertificate | null> => {
  // Route params arrive decoded; whatever else came with the code -- dashes,
  // spaces, lower case -- is stripped here, the same way the database does.
  const code = normaliseVerificationCode(raw);
  if (!CODE_SHAPE.test(code)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_certificate", { p_code: code });

  if (error) {
    console.error("[certificate] verification failed:", error);
    return null;
  }

  return (data?.[0] as VerifiedCertificate | undefined) ?? null;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const certificate = await loadCertificate(code);

  const base: Metadata = {
    robots: { index: false, follow: false, nocache: true },
  };

  if (!certificate) return { ...base, title: "Certificate not found" };

  const title = `Certificate of Completion — ${certificate.course_title}`;
  return {
    ...base,
    title,
    description: `Awarded to ${certificate.student_name} by ${SITE_NAME} on ${formatCertificateDate(certificate.issued_at)}.`,
    alternates: { canonical: certificatePath(certificate.verification_code) },
    openGraph: { title, type: "website" },
  };
}

export default async function CertificatePage({ params }: PageProps) {
  const { code } = await params;
  const certificate = await loadCertificate(code);

  if (!certificate) return <NotFound code={code} />;

  const revoked = certificate.status === "revoked";
  const url = certificateUrl(certificate.verification_code);
  const formattedCode = formatVerificationCode(certificate.verification_code);

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 print:min-h-0 print:bg-white print:p-0">
      {/* A4 landscape, edge to edge. The certificate draws its own margin. */}
      <style>{"@page { size: A4 landscape; margin: 0; }"}</style>

      <div className="mx-auto max-w-5xl print:max-w-none">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <VerificationStatus certificate={certificate} />
          <CertificateActions
            url={url}
            title={`${certificate.student_name} — ${certificate.course_title}`}
            printable={!revoked}
          />
        </div>

        <CertificateDocument
          certificate={certificate}
          url={url}
          formattedCode={formattedCode}
          revoked={revoked}
        />

        <p className="mt-5 text-center text-xs text-neutral-500 print:hidden">
          Anyone can check this certificate at this address. Certificate codes
          are unique and cannot be guessed.
        </p>
      </div>
    </main>
  );
}

function VerificationStatus({ certificate }: { certificate: VerifiedCertificate }) {
  if (certificate.status === "revoked") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">This certificate has been revoked</p>
          <p className="text-red-700">
            {SITE_NAME} withdrew it
            {certificate.revoked_at
              ? ` on ${formatCertificateDate(certificate.revoked_at)}`
              : ""}
            . It is no longer valid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <div>
        <p className="font-semibold">Verified certificate</p>
        <p className="text-emerald-800">
          Issued by {SITE_NAME} on {formatCertificateDate(certificate.issued_at)}.
        </p>
      </div>
    </div>
  );
}

/**
 * The certificate itself.
 *
 * Every size inside is in `cqw` -- a percentage of the certificate's own
 * width -- so the same layout holds on a phone, on a monitor and on A4 paper,
 * rather than reflowing into something that is no longer the document the
 * student printed.
 */
function CertificateDocument({
  certificate,
  url,
  formattedCode,
  revoked,
}: {
  certificate: VerifiedCertificate;
  url: string;
  formattedCode: string;
  revoked: boolean;
}) {
  const displayUrl = url.replace(/^https?:\/\//, "");

  return (
    <article
      aria-label={`Certificate of completion for ${certificate.student_name}`}
      className="@container relative aspect-[297/210] w-full overflow-hidden bg-[#FFFDF8] text-[#0D0D0D] shadow-xl [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:aspect-auto print:h-[210mm] print:w-[297mm] print:shadow-none"
    >
      {/* Frame: a dark-blue band, then a hairline of gold inside it. */}
      <div className="absolute inset-[2.2cqw] border-[0.55cqw] border-[#16223B]" />
      <div className="absolute inset-[3.3cqw] border-[0.12cqw] border-[#C9A84C]" />
      <Corner className="left-[2.9cqw] top-[2.9cqw]" />
      <Corner className="right-[2.9cqw] top-[2.9cqw] rotate-90" />
      <Corner className="bottom-[2.9cqw] right-[2.9cqw] rotate-180" />
      <Corner className="bottom-[2.9cqw] left-[2.9cqw] -rotate-90" />

      <div className="absolute inset-[5cqw] flex flex-col items-center text-center">
        <div className="flex items-center gap-[1.2cqw]">
          <span className="relative block h-[5.2cqw] w-[5.2cqw] overflow-hidden rounded-full ring-[0.2cqw] ring-[#C9A84C]">
            <Image src="/logo.jpg" alt="" fill sizes="80px" className="object-cover" priority />
          </span>
          <span className="text-[1.25cqw] font-semibold uppercase tracking-[0.42em] text-[#16223B]">
            {SITE_NAME}
          </span>
        </div>

        <h1 className="mt-[2.6cqw] font-heading text-[4.6cqw] font-bold leading-none tracking-tight text-[#0D0D0D]">
          Certificate of Completion
        </h1>
        <div className="mt-[1.4cqw] flex items-center gap-[0.8cqw]" aria-hidden>
          <span className="h-[0.1cqw] w-[7cqw] bg-[#C9A84C]" />
          <span className="h-[0.7cqw] w-[0.7cqw] rotate-45 bg-[#F26A21]" />
          <span className="h-[0.1cqw] w-[7cqw] bg-[#C9A84C]" />
        </div>

        <p className="mt-[2.4cqw] text-[1.25cqw] uppercase tracking-[0.3em] text-neutral-500">
          This is to certify that
        </p>
        <p className="mt-[1.3cqw] max-w-[80cqw] border-b-[0.12cqw] border-[#C9A84C] px-[3cqw] pb-[0.8cqw] font-heading text-[4.2cqw] font-semibold italic leading-tight text-[#16223B]">
          {certificate.student_name}
        </p>
        <p className="mt-[2cqw] text-[1.35cqw] text-neutral-600">
          has successfully completed every lesson of the course
        </p>
        <p className="mt-[1cqw] max-w-[74cqw] font-heading text-[2.5cqw] font-semibold leading-snug text-[#0D0D0D]">
          {certificate.course_title}
        </p>

        <div className="mt-auto grid w-full grid-cols-3 items-end gap-[2cqw] pb-[0.5cqw]">
          <div className="flex flex-col items-center">
            <p className="font-heading text-[1.6cqw] font-semibold text-[#16223B]">
              {formatCertificateDate(certificate.issued_at)}
            </p>
            <span className="mt-[0.6cqw] h-[0.1cqw] w-[18cqw] bg-neutral-400" />
            <p className="mt-[0.6cqw] text-[1cqw] uppercase tracking-[0.25em] text-neutral-500">
              Date of issue
            </p>
          </div>

          <div className="flex justify-center">
            <Seal />
          </div>

          <div className="flex flex-col items-center">
            <p className="font-heading text-[2cqw] italic leading-none text-[#16223B]">
              {certificate.signatory_name}
            </p>
            <span className="mt-[0.6cqw] h-[0.1cqw] w-[18cqw] bg-neutral-400" />
            <p className="mt-[0.6cqw] text-[1cqw] uppercase tracking-[0.25em] text-neutral-500">
              {certificate.signatory_title}
            </p>
          </div>
        </div>

        <div className="mt-[1.6cqw] flex w-full items-center justify-between text-[0.95cqw] text-neutral-500">
          <span>
            Certificate No.{" "}
            <span className="font-mono font-semibold text-neutral-700">
              {certificate.certificate_number}
            </span>
          </span>
          <span>
            Verify at{" "}
            <span className="font-mono font-semibold text-neutral-700">{displayUrl}</span>
          </span>
        </div>
        <span className="sr-only">Verification code {formattedCode}</span>
      </div>

      {revoked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-[18deg] rounded-[1cqw] border-[0.5cqw] border-red-600/70 px-[3cqw] py-[0.6cqw] text-[9cqw] font-black uppercase tracking-[0.1em] text-red-600/60">
            Revoked
          </span>
        </div>
      )}
    </article>
  );
}

/** A gold corner flourish, drawn for the top-left and rotated for the rest. */
function Corner({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`absolute h-[4.4cqw] w-[4.4cqw] text-[#C9A84C] ${className}`}
      aria-hidden
    >
      <path d="M2 38 V8 Q2 2 8 2 H38" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 38 V14 Q8 8 14 8 H38" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="8" cy="8" r="2.2" fill="#F26A21" />
    </svg>
  );
}

/** The seal: a gold rosette with the initials, for the eye rather than for proof. */
function Seal() {
  const points = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const radius = i % 2 === 0 ? 48 : 43;
    return `${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-[9.5cqw] w-[9.5cqw]" aria-hidden>
      <polygon points={points} fill="#C9A84C" />
      <circle cx="50" cy="50" r="38" fill="#16223B" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#C9A84C" strokeWidth="0.8" />
      <text
        x="50"
        y="49"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-heading), serif" }}
        fontSize="20"
        fontWeight="700"
        fill="#FFFFFF"
      >
        DE
      </text>
      <text
        x="50"
        y="64"
        textAnchor="middle"
        fontSize="6.5"
        letterSpacing="1.6"
        fill="#C9A84C"
      >
        VERIFIED
      </text>
    </svg>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-16 text-neutral-900">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-10 w-10 text-neutral-400" />
        <h1 className="mt-4 font-heading text-2xl font-semibold">
          No certificate with this code
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          We could not find an issued certificate for{" "}
          <span className="font-mono font-semibold">
            {formatVerificationCode(code.slice(0, 40)).slice(0, 20)}
          </span>
          . Check the code printed at the bottom of the certificate and try
          again.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
        >
          Go to {SITE_NAME}
        </Link>
      </div>
    </main>
  );
}
