"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "./date-range-filter";
import { RevenueStatsCards, RevenueStatsCardsSkeleton } from "./revenue-stats-cards";
import {
  fetchRevenueAnalytics,
  fetchPaymentMethodBreakdown,
  fetchDailyOrders,
  fetchCourseRevenue,
  type RevenueStats,
  type MonthlyRevenue,
  type DailyOrder,
  type PaymentMethodBreakdown,
  type CourseRevenue,
} from "@/app/admin/(panel)/revenue/actions";

// The charts pull in recharts, which is large and only needed once the first
// range of data has loaded. Loading them on demand keeps it out of the tab's
// initial bundle; the skeleton below stands in while each chunk arrives.
function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}

const MonthlyRevenueChart = dynamic(
  () => import("./revenue-charts").then((m) => m.MonthlyRevenueChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const DailyOrdersChart = dynamic(
  () => import("./revenue-charts").then((m) => m.DailyOrdersChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const PaymentMethodChart = dynamic(
  () => import("./revenue-charts").then((m) => m.PaymentMethodChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const CourseRevenueChart = dynamic(
  () => import("./revenue-charts").then((m) => m.CourseRevenueChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AnalyticsTab() {
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(todayStr());
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRevenue[]>([]);
  const [daily, setDaily] = useState<DailyOrder[]>([]);
  const [methods, setMethods] = useState<PaymentMethodBreakdown[]>([]);
  const [courses, setCourses] = useState<CourseRevenue[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    const from = dateFrom || daysAgo(30);
    const to = dateTo || todayStr();

    // Calculate previous period of same duration
    const durationMs = new Date(to).getTime() - new Date(from).getTime();
    const prevTo = from;
    const prevFrom = new Date(new Date(from).getTime() - durationMs).toISOString().slice(0, 10);

    startTransition(async () => {
      const [analyticsResult, methodsResult, dailyResult, coursesResult] = await Promise.all([
        fetchRevenueAnalytics({
          from: new Date(from).toISOString(),
          to: new Date(to + "T23:59:59").toISOString(),
          prevFrom: new Date(prevFrom).toISOString(),
          prevTo: new Date(prevTo).toISOString(),
        }),
        fetchPaymentMethodBreakdown(
          new Date(from).toISOString(),
          new Date(to + "T23:59:59").toISOString()
        ),
        fetchDailyOrders(
          new Date(from).toISOString(),
          new Date(to + "T23:59:59").toISOString()
        ),
        fetchCourseRevenue(8),
      ]);

      if (analyticsResult.data) {
        setStats(analyticsResult.data.stats);
        setMonthly(analyticsResult.data.monthlyRevenue);
      } else if (analyticsResult.error) {
        toast.error(analyticsResult.error);
      }

      if (methodsResult.data) setMethods(methodsResult.data);
      if (dailyResult.data) setDaily(dailyResult.data);
      if (coursesResult.data) setCourses(coursesResult.data);
    });
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          presets
        />
        <ExportButton
          dataset="revenue-analytics"
          filters={{ dateFrom, dateTo }}
          label="Download this view"
          size="default"
        />
      </div>

      {isPending || !stats ? (
        <>
          <RevenueStatsCardsSkeleton />
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </>
      ) : (
        <>
          <RevenueStatsCards stats={stats} />
          <div className="grid gap-6 lg:grid-cols-2">
            <MonthlyRevenueChart data={monthly} />
            <DailyOrdersChart data={daily} />
            <PaymentMethodChart data={methods} />
            <CourseRevenueChart data={courses} />
          </div>
        </>
      )}
    </div>
  );
}
