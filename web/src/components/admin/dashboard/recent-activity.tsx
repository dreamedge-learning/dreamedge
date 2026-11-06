"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  ClipboardList,
  IndianRupee,
  RotateCcw,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format";
import { toActivityItem, type ActivityItem, type AuditLogRow } from "@/lib/activity";

const MAX_ITEMS = 10;

const timestampFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const ICONS: { match: RegExp; icon: React.ElementType; className: string }[] = [
  { match: /refund/, icon: RotateCcw, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  {
    match: /order|payment|purchase|invoice/,
    icon: IndianRupee,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    match: /enrol/,
    icon: UserPlus,
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  { match: /student|lead/, icon: Users, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { match: /test|question/, icon: ClipboardList, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { match: /live|class|recording/, icon: Video, className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  { match: /course|content|subject|topic/, icon: BookOpen, className: "bg-brand-orange/10 text-brand-orange" },
];

function iconFor(item: ActivityItem) {
  const key = `${item.entityType} ${item.action}`.toLowerCase();
  return (
    ICONS.find((entry) => entry.match.test(key)) ?? {
      icon: Activity,
      className: "bg-muted text-muted-foreground",
    }
  );
}

export function RecentActivity({
  initialItems,
  renderedAt,
}: {
  initialItems: ActivityItem[];
  // Seeded from the server so the first client render matches the HTML.
  renderedAt: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload) => {
          const item = toActivityItem(payload.new as AuditLogRow);
          setItems((current) =>
            [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, MAX_ITEMS)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Recent Activity
          <span className="relative flex size-2" aria-label="Live">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
        </CardTitle>
        <CardDescription>Purchases, enrollments and content changes</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing here yet"
            description="Admin actions and student purchases will appear here as they happen."
          />
        ) : (
          <ol className="space-y-4">
            {items.map((item) => {
              const { icon: Icon, className } = iconFor(item);
              return (
                <li key={item.id} className="flex gap-3">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{item.description}</p>
                    <time
                      dateTime={item.createdAt}
                      title={timestampFormatter.format(new Date(item.createdAt))}
                      className="text-xs text-muted-foreground"
                    >
                      {formatRelativeTime(item.createdAt, now)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentActivitySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
