import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { countPendingApplications } from "./settings/applications-actions";

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

  return (
    <AdminShell admin={admin} pendingApplications={pendingApplications}>
      {children}
    </AdminShell>
  );
}
