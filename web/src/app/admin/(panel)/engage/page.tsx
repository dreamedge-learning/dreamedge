import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NotificationsClient,
  type NotificationRow,
  type TargetOptions,
} from "@/components/admin/engage/notifications-client";
import { fetchNotifications, fetchNotificationTargets } from "./actions";

export const metadata: Metadata = {
  title: "Notifications | Dream Edge Admin",
};

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

async function NotificationsLoader() {
  const [list, targets] = await Promise.all([
    fetchNotifications(),
    fetchNotificationTargets(),
  ]);

  return (
    <NotificationsClient
      initialData={(list.data ?? []) as NotificationRow[]}
      targets={(targets.data ?? { courses: [], students: [] }) as TargetOptions}
    />
  );
}

export default function EngagePage() {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsLoader />
    </Suspense>
  );
}
