import type { Metadata } from "next";
export const dynamic = "force-dynamic";
import { StudentShell } from "@/components/student/student-shell";
import { MaintenanceNotice } from "@/components/student/maintenance-notice";
import { getAdminSession } from "@/lib/admin";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: {
    default: "Dream Edge Online — Premium Coaching for Classes 6-10",
    template: "%s | Dream Edge Online",
  },
};

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();

  // Maintenance closes the student site, not the panel: /admin sits outside
  // this layout, so the team can still work while students see the notice.
  // An admin browsing the student side is let through, because the person who
  // turned maintenance on is usually the person who needs to check the fix.
  if (settings.maintenance_mode) {
    const admin = await getAdminSession();

    if (!admin) {
      return (
        <MaintenanceNotice
          platformName={settings.platform_name}
          supportEmail={settings.support_email}
          supportPhone={settings.support_phone}
        />
      );
    }
  }

  return (
    <StudentShell socialLinks={settings.social_links}>{children}</StudentShell>
  );
}
