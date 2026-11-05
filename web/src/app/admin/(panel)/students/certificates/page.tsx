import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Info } from "lucide-react";

import { CertificatesClient } from "@/components/admin/students/certificates-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSession, hasPermission } from "@/lib/admin";
import {
  CERTIFICATE_DECIDE_ROLES,
  CERTIFICATE_REVOKE_ROLES,
  CERTIFICATE_VIEW_ROLES,
  DEFAULT_SIGNATORY_NAME,
  DEFAULT_SIGNATORY_TITLE,
} from "@/lib/certificates";
import { getSiteSettings } from "@/lib/settings";

import { fetchCoursesList } from "../actions";
import { fetchCertificateCounts, fetchCertificates } from "./actions";

export const metadata: Metadata = {
  title: "Certificates | Dream Edge Admin",
};

export default function CertificatesPage() {
  return (
    <Suspense fallback={<CertificatesSkeleton />}>
      <CertificatesContent />
    </Suspense>
  );
}

async function CertificatesContent() {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, CERTIFICATE_VIEW_ROLES)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="max-w-md text-center text-muted-foreground">
          You don&apos;t have permission to view certificates. Contact your
          administrator if you need access.
        </p>
      </div>
    );
  }

  const [pending, counts, courses, settings] = await Promise.all([
    fetchCertificates({ status: "pending", page: 1, pageSize: 20 }),
    fetchCertificateCounts(),
    fetchCoursesList(),
    getSiteSettings(),
  ]);

  // Only super admin and technical can read the private settings rows, so for
  // anyone else this would show the defaults whatever is actually configured.
  // Better to say nothing than to say something wrong.
  const canSeeSignatory =
    admin.role_name === "super_admin" || admin.role_name === "technical";
  const signatoryIsDefault =
    settings.certificate_signatory_name === DEFAULT_SIGNATORY_NAME &&
    settings.certificate_signatory_title === DEFAULT_SIGNATORY_TITLE;

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
        <p className="mt-1 text-muted-foreground">
          A request is filed automatically when a student completes every
          lesson in a course. Nothing is issued until it is approved here.
        </p>
      </div>

      {canSeeSignatory && (
        <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Certificates approved now are signed{" "}
            <strong className="text-foreground">
              {settings.certificate_signatory_name},{" "}
              {settings.certificate_signatory_title}
            </strong>
            .{" "}
            {signatoryIsDefault
              ? "That is the default — set the real name and title in Settings → Platform → Certificates before approving."
              : "Change it in Settings → Platform → Certificates."}
          </p>
        </div>
      )}

      <CertificatesClient
        initialData={pending.data}
        initialCount={pending.count}
        initialError={pending.error}
        initialCounts={counts}
        courses={courses}
        canDecide={hasPermission(admin, CERTIFICATE_DECIDE_ROLES)}
        canRevoke={hasPermission(admin, CERTIFICATE_REVOKE_ROLES)}
      />
    </div>
  );
}

function CertificatesSkeleton() {
  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-96" />
      </div>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
