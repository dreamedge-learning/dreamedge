import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { countPendingApplications } from "./settings/applications-actions";
import { countNewFeedback } from "./engage/feedback/actions";

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

  // Both counts come straight from the tables they summarise, so the badge
  // cannot drift from the queue it refers to. Each returns 0 for roles
  // outside its own audience, so a single query per paint is cheap.
  const [pendingApplications, pendingFeedback] = await Promise.all([
    countPendingApplications(),
    countNewFeedback(),
  ]);

  return (
    <AdminShell
      admin={admin}
      pendingApplications={pendingApplications}
      pendingFeedback={pendingFeedback}
    >
      {children}
    </AdminShell>
  );
}
