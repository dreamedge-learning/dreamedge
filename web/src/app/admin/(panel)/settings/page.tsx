import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { absoluteUrl } from "@/lib/site";
import { SettingsPageClient } from "./client";
import { getSiteSettings } from "@/lib/settings";
import {
  getAdminApplications,
  getAdminGateStatus,
} from "./applications-actions";
import { getLegalDocuments } from "./legal-actions";
import { getBillingProfile } from "./billing-actions";
import {
  getAdminTeam,
  getRoles,
  getAuditLog,
  getSettings,
  getAdminUsersLite,
} from "./actions";

const SETTINGS_ROLES = ["super_admin", "technical"] as const;

export const metadata: Metadata = {
  title: "Settings | Dream Edge Admin",
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

const TABS = ["team", "applications", "roles", "audit", "platform", "legal", "billing"];

export default async function SettingsPage({ searchParams }: PageProps) {
  // Read here rather than in a client hook so the tab is right on first paint:
  // the application email links straight to ?tab=applications.
  const { tab } = await searchParams;
  const initialTab = tab && TABS.includes(tab) ? tab : "team";

  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsContent initialTab={initialTab} />
    </Suspense>
  );
}

async function SettingsContent({ initialTab }: { initialTab: string }) {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, [...SETTINGS_ROLES])) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You don&apos;t have permission to view settings.
          Contact your administrator if you need access.
        </p>
      </div>
    );
  }

  // Applications and the access gate are super-admin-only. `technical` gets
  // the rest of the page and no Applications tab at all, rather than a tab
  // that loads and then refuses.
  const isSuperAdmin = admin.role_name === "super_admin";

  const [
    teamResult,
    rolesResult,
    auditResult,
    settingsResult,
    adminUsersResult,
    applicationsResult,
    gateResult,
    legalResult,
    billingResult,
    liveSettings,
  ] = await Promise.all([
    getAdminTeam({ page: 1, pageSize: 10 }),
    getRoles(),
    getAuditLog({ page: 1, pageSize: 20 }),
    getSettings(),
    getAdminUsersLite(),
    isSuperAdmin ? getAdminApplications("pending") : null,
    isSuperAdmin ? getAdminGateStatus() : null,
    isSuperAdmin ? getLegalDocuments() : null,
    isSuperAdmin ? getBillingProfile() : null,
    getSiteSettings(),
  ]);

  const applications = applicationsResult?.data ?? null;

  return (
    <SettingsPageClient
      initialTeam={teamResult.data ?? []}
      initialTeamCount={teamResult.count}
      initialRoles={rolesResult.data ?? []}
      initialAuditLog={auditResult.data ?? []}
      initialAuditLogCount={auditResult.count}
      initialSettings={settingsResult.data ?? []}
      adminUsers={adminUsersResult.data ?? []}
      applications={applications}
      gate={gateResult?.data ?? null}
      pendingApplications={
        applications?.filter((row) => row.status === "pending").length ?? 0
      }
      applyUrl={absoluteUrl("/admin/apply")}
      legalDocuments={legalResult?.data ?? null}
      billingProfile={billingResult ? billingResult.data : undefined}
      supportEmail={liveSettings.support_email}
      supportPhone={liveSettings.support_phone}
      platformName={liveSettings.platform_name}
      initialTab={initialTab}
    />
  );
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-[480px]" />
      <div className="space-y-4">
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}
