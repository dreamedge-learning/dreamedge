import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { KpiCards, KpiCardsSkeleton } from "@/components/admin/dashboard/kpi-cards";
import { RevenueChart } from "@/components/admin/dashboard/revenue-chart";
import { EnrollmentChart } from "@/components/admin/dashboard/enrollment-chart";
import { RecentActivity, RecentActivitySkeleton } from "@/components/admin/dashboard/recent-activity";
import { QuickActions } from "@/components/admin/dashboard/quick-actions";
import {
  CoursePerformance,
  CoursePerformanceSkeleton,
} from "@/components/admin/dashboard/course-performance";
import { RestrictedState } from "@/components/admin/dashboard/empty-state";
import { ExportButton } from "@/components/admin/export-button";
import { getAdminSession, type AdminSession } from "@/lib/admin";
import {
  AUDIT_ROLES,
  FINANCE_ROLES,
  getDashboardKpis,
  getEnrollmentTrend,
  getRecentActivity,
  getRevenueTrend,
  getTopCourses,
} from "@/lib/dashboard";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  // Everything below depends on the current time and the signed-in admin.
  await connection();
  const admin = await getAdminSession();
  // The panel layout already redirects signed-out users.
  if (!admin) return null;

  const firstName = admin.full_name.split(" ")[0];
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Welcome back, {firstName}.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{today}</p>
          <ExportButton dataset="dashboard" label="Download this view" />
        </div>
      </div>

      <ErrorBoundary>
        <Suspense fallback={<KpiCardsSkeleton />}>
          <KpiSection admin={admin} />
        </Suspense>
      </ErrorBoundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <ErrorBoundary>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueSection admin={admin} />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary>
          <Suspense fallback={<ChartSkeleton />}>
            <EnrollmentSection />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-2">
          <ErrorBoundary>
            <Suspense fallback={<CoursePerformanceSkeleton />}>
              <CoursePerformanceSection admin={admin} />
            </Suspense>
          </ErrorBoundary>
        </div>
        <div className="space-y-4">
          <QuickActions role={admin.role_name} />
          <ErrorBoundary>
            <Suspense fallback={<RecentActivitySkeleton />}>
              <ActivitySection admin={admin} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

async function KpiSection({ admin }: { admin: AdminSession }) {
  const kpis = await getDashboardKpis(admin.role_name);
  return <KpiCards kpis={kpis} />;
}

async function RevenueSection({ admin }: { admin: AdminSession }) {
  if (!FINANCE_ROLES.includes(admin.role_name)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <RestrictedState className="h-64" />
        </CardContent>
      </Card>
    );
  }

  const data = await getRevenueTrend();
  return <RevenueChart data={data} />;
}

async function EnrollmentSection() {
  const data = await getEnrollmentTrend();
  return <EnrollmentChart data={data} />;
}

async function CoursePerformanceSection({ admin }: { admin: AdminSession }) {
  const courses = await getTopCourses(admin.role_name);
  return <CoursePerformance courses={courses} />;
}

async function ActivitySection({ admin }: { admin: AdminSession }) {
  if (!AUDIT_ROLES.includes(admin.role_name)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <RestrictedState />
        </CardContent>
      </Card>
    );
  }

  const { items, fetchedAt } = await getRecentActivity();
  return <RecentActivity initialItems={items} renderedAt={fetchedAt} />;
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <KpiCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-2">
          <CoursePerformanceSkeleton />
        </div>
        <RecentActivitySkeleton />
      </div>
    </div>
  );
}
