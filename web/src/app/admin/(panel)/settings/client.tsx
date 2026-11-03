"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Shield, ScrollText, Settings, UserPlus } from "lucide-react";
import { AdminTeamTable } from "@/components/admin/settings/admin-team-table";
import { RolesPermissions } from "@/components/admin/settings/roles-permissions";
import { AuditLogTable } from "@/components/admin/settings/audit-log-table";
import { PlatformSettings } from "@/components/admin/settings/platform-settings";
import { ApplicationsTable } from "@/components/admin/settings/applications-table";
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
  initialTab,
}: SettingsPageClientProps) {
  const showApplications = applications !== null && gate !== null;

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
      </Tabs>
    </div>
  );
}
