"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Shield, ScrollText, Settings, UserPlus, Scale, ReceiptText } from "lucide-react";
import { AdminTeamTable } from "@/components/admin/settings/admin-team-table";
import { RolesPermissions } from "@/components/admin/settings/roles-permissions";
import { AuditLogTable } from "@/components/admin/settings/audit-log-table";
import { PlatformSettings } from "@/components/admin/settings/platform-settings";
import { ApplicationsTable } from "@/components/admin/settings/applications-table";
import { LegalEditor } from "@/components/admin/settings/legal-editor";
import { BillingSettings } from "@/components/admin/settings/billing-settings";
import type { BillingProfile } from "./billing-actions";
import type {
  AdminTeamRow,
  RoleRow,
  AuditLogRow,
  SiteSetting,
  AdminUserLite,
} from "./actions";
import type {
  AdminApplicationRow,
  AdminGateStatus,
} from "./applications-actions";
import type { LegalDocument } from "@/lib/legal";

interface SettingsPageClientProps {
  initialTeam: AdminTeamRow[];
  initialTeamCount: number;
  initialRoles: RoleRow[];
  initialAuditLog: AuditLogRow[];
  initialAuditLogCount: number;
  initialSettings: SiteSetting[];
  adminUsers: AdminUserLite[];
  /** Applications are super-admin-only, so these are absent for `technical`. */
  applications: AdminApplicationRow[] | null;
  gate: AdminGateStatus | null;
  pendingApplications: number;
  applyUrl: string;
  /** Policy pages are super-admin-only, so this is absent for `technical`. */
  legalDocuments: LegalDocument[] | null;
  /**
   * Receipt and GST details are super-admin-only: undefined for `technical`,
   * null when the row could not be read.
   */
  billingProfile?: BillingProfile | null;
  supportEmail: string;
  supportPhone: string;
  platformName: string;
  initialTab: string;
}

export function SettingsPageClient({
  initialTeam,
  initialTeamCount,
  initialRoles,
  initialAuditLog,
  initialAuditLogCount,
  initialSettings,
  adminUsers,
  applications,
  gate,
  pendingApplications,
  applyUrl,
  legalDocuments,
  billingProfile,
  supportEmail,
  supportPhone,
  platformName,
  initialTab,
}: SettingsPageClientProps) {
  const showApplications = applications !== null && gate !== null;
  const showLegal = legalDocuments !== null;
  const showBilling = billingProfile !== undefined;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your team, roles, and platform configuration.
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="team">
            <Users className="mr-1.5 h-4 w-4" />
            Admin Team
          </TabsTrigger>
          {showApplications && (
            <TabsTrigger value="applications">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Applications
              {pendingApplications > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-medium text-white">
                  {pendingApplications}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="roles">
            <Shield className="mr-1.5 h-4 w-4" />
            Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText className="mr-1.5 h-4 w-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="platform">
            <Settings className="mr-1.5 h-4 w-4" />
            Platform
          </TabsTrigger>
          {showLegal && (
            <TabsTrigger value="legal">
              <Scale className="mr-1.5 h-4 w-4" />
              Legal Pages
            </TabsTrigger>
          )}
          {showBilling && (
            <TabsTrigger value="billing">
              <ReceiptText className="mr-1.5 h-4 w-4" />
              Receipts & GST
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="team" className="mt-6">
          <AdminTeamTable
            initialData={initialTeam}
            initialCount={initialTeamCount}
            roles={initialRoles}
          />
        </TabsContent>

        {showApplications && (
          <TabsContent value="applications" className="mt-6">
            <ApplicationsTable
              initialData={applications}
              gate={gate}
              applyUrl={applyUrl}
            />
          </TabsContent>
        )}

        <TabsContent value="roles" className="mt-6">
          <RolesPermissions initialData={initialRoles} />
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <AuditLogTable
            initialData={initialAuditLog}
            initialCount={initialAuditLogCount}
            adminUsers={adminUsers}
          />
        </TabsContent>

        <TabsContent value="platform" className="mt-6">
          <PlatformSettings initialData={initialSettings} />
        </TabsContent>

        {showLegal && (
          <TabsContent value="legal" className="mt-6">
            <LegalEditor
              documents={legalDocuments}
              supportEmail={supportEmail}
              supportPhone={supportPhone}
              platformName={platformName}
            />
          </TabsContent>
        )}

        {showBilling && (
          <TabsContent value="billing" className="mt-6">
            <BillingSettings profile={billingProfile ?? null} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
