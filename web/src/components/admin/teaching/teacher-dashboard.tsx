import { Suspense } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { AdminSession } from "@/lib/admin";
import {
  getTeacherCourseProgress,
  getTeacherDoubtSummary,
  getTeacherLiveClasses,
} from "@/lib/teaching";
import {
  LiveClassesPanel,
  LiveClassesPanelSkeleton,
} from "@/components/admin/teaching/live-classes-panel";
import {
  DoubtsSummary,
  DoubtsSummarySkeleton,
} from "@/components/admin/teaching/doubts-summary";
import {
  CourseProgress,
  CourseProgressSkeleton,
} from "@/components/admin/teaching/course-progress";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
});

/**
 * The home screen a teacher lands on at /admin. It stands in for the
 * super-admin KPI dashboard: the figures there (revenue, sign-ups, the audit
 * log) are not a teacher's to see, so this shows their own work instead --
 * their classes, the doubts they can answer, and how their courses are
 * progressing. Everything is read-only.
 */
export function TeacherDashboard({ admin }: { admin: AdminSession }) {
  const firstName = admin.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teaching</h1>
          <p className="mt-1 text-muted-foreground">Welcome back, {firstName}.</p>
        </div>
        <p className="text-sm text-muted-foreground">{dateFmt.format(new Date())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ErrorBoundary>
          <Suspense fallback={<LiveClassesPanelSkeleton />}>
            <LiveClassesSection admin={admin} />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary>
          <Suspense fallback={<DoubtsSummarySkeleton />}>
            <DoubtsSection admin={admin} />
          </Suspense>
        </ErrorBoundary>
      </div>

      <ErrorBoundary>
        <Suspense fallback={<CourseProgressSkeleton />}>
          <CourseProgressSection admin={admin} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

async function LiveClassesSection({ admin }: { admin: AdminSession }) {
  const data = await getTeacherLiveClasses(admin.id);
  return <LiveClassesPanel data={data} />;
}

async function DoubtsSection({ admin }: { admin: AdminSession }) {
  const data = await getTeacherDoubtSummary(admin.id);
  return <DoubtsSummary data={data} />;
}

async function CourseProgressSection({ admin }: { admin: AdminSession }) {
  const courses = await getTeacherCourseProgress(admin.id);
  return <CourseProgress courses={courses} />;
}
