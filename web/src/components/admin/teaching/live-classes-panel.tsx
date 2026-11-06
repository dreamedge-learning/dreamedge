import Link from "next/link";
import { CalendarClock, Radio, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { cn } from "@/lib/utils";
import type { TeacherLiveClass, TeacherLiveClasses } from "@/lib/teaching";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function StatusBadge({ status }: { status: TeacherLiveClass["status"] }) {
  if (status === "live") {
    return <Badge className="animate-pulse bg-red-500 text-white">Live</Badge>;
  }
  if (status === "cancelled") {
    return (
      <Badge className="bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">Cancelled</Badge>
    );
  }
  if (status === "ended") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Ended</Badge>
    );
  }
  return <Badge variant="secondary">Scheduled</Badge>;
}

function ClassRow({ cls }: { cls: TeacherLiveClass }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{cls.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {cls.courseTitle && <span className="truncate">{cls.courseTitle}</span>}
          <span aria-hidden>·</span>
          <span className="tabular-nums">{dateFmt.format(new Date(cls.scheduledAt))}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{cls.durationMinutes} min</span>
        </p>
      </div>
      <StatusBadge status={cls.status} />
    </li>
  );
}

function Section({
  title,
  icon: Icon,
  classes,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  icon: React.ElementType;
  classes: TeacherLiveClass[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        <span>{title}</span>
        {classes.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">({classes.length})</span>
        )}
      </div>
      {classes.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={emptyTitle}
          description={emptyDescription}
          className="py-6"
        />
      ) : (
        <ul className="divide-y">
          {classes.map((cls) => (
            <ClassRow key={cls.id} cls={cls} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function LiveClassesPanel({ data }: { data: TeacherLiveClasses }) {
  const nothing = data.upcoming.length === 0 && data.recent.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>My Live Classes</CardTitle>
          <CardDescription>Classes assigned to you</CardDescription>
        </div>
        <Link
          href="/admin/live-classes"
          className="text-sm font-medium text-brand-orange hover:underline"
        >
          Open
        </Link>
      </CardHeader>
      <CardContent className="space-y-5">
        {nothing ? (
          <EmptyState
            icon={Video}
            title="No classes yet"
            description="Once a class is scheduled with you as the teacher, it will show up here."
          />
        ) : (
          <>
            <Section
              title="Upcoming"
              icon={CalendarClock}
              classes={data.upcoming}
              emptyTitle="Nothing scheduled"
              emptyDescription="You have no upcoming or live classes right now."
            />
            {data.recent.length > 0 && (
              <Section
                title="Recent"
                icon={Radio}
                classes={data.recent}
                emptyTitle="Nothing recent"
                emptyDescription="Classes you have finished will appear here."
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LiveClassesPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className={cn("h-12 w-full", i === 0 && "mt-1")} />
        ))}
      </CardContent>
    </Card>
  );
}
