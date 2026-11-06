import { ArrowDownRight, ArrowUpRight, BookOpen, Clock, IndianRupee, Lock, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatINR, formatNumber } from "@/lib/format";
import type { DashboardKpis } from "@/lib/dashboard";

interface Kpi {
  label: string;
  value: string | null;
  icon: React.ElementType;
  trend?: number | null;
  hint: string;
}

function Trend({ value }: { value: number }) {
  const rounded = Math.round(value * 10) / 10;
  const up = rounded > 0;
  const down = rounded < 0;
  const Arrow = down ? ArrowDownRight : ArrowUpRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
        up && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        down && "bg-red-500/10 text-red-600 dark:text-red-400",
        !up && !down && "bg-muted text-muted-foreground"
      )}
    >
      {(up || down) && <Arrow className="size-3" />}
      {Math.abs(rounded)}%
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const items: Kpi[] = [
    {
      label: "Total Students",
      value: formatNumber(kpis.totalStudents),
      icon: Users,
      trend: kpis.studentGrowth,
      hint:
        kpis.newStudentsThisMonth > 0
          ? `+${formatNumber(kpis.newStudentsThisMonth)} this month`
          : "No new sign-ups this month",
    },
    {
      label: "Active Courses",
      value: formatNumber(kpis.activeCourses),
      icon: BookOpen,
      hint: kpis.draftCourses > 0 ? `${kpis.draftCourses} in draft` : "Published and on sale",
    },
    {
      label: "Revenue This Month",
      value: kpis.revenueThisMonth === null ? null : formatINR(kpis.revenueThisMonth),
      icon: IndianRupee,
      trend: kpis.revenueGrowth,
      hint: "vs last month",
    },
    {
      label: "Pending Enrollments",
      value: kpis.pendingEnrollments === null ? null : formatNumber(kpis.pendingEnrollments),
      icon: Clock,
      hint: "Orders awaiting payment",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((kpi) => {
        const Icon = kpi.icon;
        const restricted = kpi.value === null;

        return (
          <Card key={kpi.label} className="gap-3 px-5 py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <div className="flex size-9 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
                <Icon className="size-4" />
              </div>
            </div>

            {restricted ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="size-4" />
                <span className="text-sm">Restricted</span>
              </div>
            ) : (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{kpi.value}</p>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {!restricted && kpi.trend != null && <Trend value={kpi.trend} />}
              <span className="truncate">{restricted ? "Finance roles only" : kpi.hint}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="gap-3 px-5 py-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32" />
        </Card>
      ))}
    </div>
  );
}
