import Link from "next/link";
import { Inbox, MessageCircleQuestion } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { formatRelativeTime } from "@/lib/format";
import type { TeacherDoubtSummary } from "@/lib/teaching";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function DoubtsSummary({ data }: { data: TeacherDoubtSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Doubts</CardTitle>
          <CardDescription>Questions waiting on a teacher</CardDescription>
        </div>
        <Link
          href="/admin/doubts"
          className="text-sm font-medium text-brand-orange hover:underline"
        >
          Open inbox
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Unanswered" value={data.open} />
          <Stat label="Assigned to you" value={data.assignedToMe} />
        </div>

        {data.recent.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Inbox clear"
            description="There are no unanswered questions right now."
            className="py-6"
          />
        ) : (
          <div>
            <p className="mb-1 text-sm font-medium">Latest unanswered</p>
            <ul className="divide-y">
              {data.recent.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/doubts/${row.id}`}
                    className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm group-hover:text-brand-orange">
                        {row.body}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="truncate">{row.studentName}</span>
                        {row.lessonTitle && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{row.lessonTitle}</span>
                          </>
                        )}
                        <span aria-hidden>·</span>
                        <span>{formatRelativeTime(row.createdAt)}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DoubtsSummarySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-44" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="h-[72px] w-full" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
