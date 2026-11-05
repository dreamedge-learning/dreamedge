import { redirect } from "next/navigation";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { DOUBT_READ_ROLES } from "@/lib/doubts";
import { AdminShell } from "@/components/admin/admin-shell";
import { countPendingApplications } from "./settings/applications-actions";
import { countOpenDoubts } from "./doubts/actions";

// Every admin route is session-gated, so there's no static shell worth
// prerendering — let the layout block on the auth check.

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();

  if (!admin) {
    redirect("/admin/login");
  }

  // Counted from the applications table itself, so the badge cannot disagree
  // with the queue. Returns 0 for every role but super admin.
  const pendingApplications = await countPendingApplications();

  // The unanswered-doubts badge. Zero for roles that cannot open the inbox.
  const openDoubts = hasPermission(admin, DOUBT_READ_ROLES) ? await countOpenDoubts() : 0;

  return (
    <AdminShell admin={admin} pendingApplications={pendingApplications} openDoubts={openDoubts}>
      {children}
    </AdminShell>
  );
}
