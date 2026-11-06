import Link from "next/link";
import { Bell, ChevronRight, Plus, Users, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserRole } from "@/types/database";

const ACTIONS: {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
}[] = [
  {
    label: "Add Course",
    description: "Create a new course draft",
    href: "/admin/content",
    icon: Plus,
    roles: ["super_admin", "content_creator"],
  },
  {
    label: "Schedule Class",
    description: "Plan a live session",
    href: "/admin/live-classes",
    icon: Video,
    roles: ["super_admin", "content_creator", "teacher"],
  },
  {
    label: "View All Students",
    description: "Profiles, progress and leads",
    href: "/admin/students",
    icon: Users,
    roles: ["super_admin", "content_creator", "teacher", "accountant", "support_staff", "technical"],
  },
  {
    label: "Send Notification",
    description: "Push, in-app or email",
    href: "/admin/engage",
    icon: Bell,
    roles: ["super_admin", "support_staff"],
  },
];

export function QuickActions({ role }: { role: UserRole }) {
  const actions = ACTIONS.filter((action) => action.roles.includes(role));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-brand-orange/40 hover:bg-brand-orange/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-blue text-white dark:bg-brand-orange/15 dark:text-brand-orange">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="truncate text-xs text-muted-foreground">{action.description}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
