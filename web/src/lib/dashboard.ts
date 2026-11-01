import { createClient } from "@/lib/supabase/server";
import { percentChange } from "@/lib/format";
import { toActivityItem, type ActivityItem, type AuditLogRow } from "@/lib/activity";
import type { UserRole } from "@/types/database";

// RLS mirrors these — orders are visible to finance roles only and the audit
// log to super admins and technical staff. Checking up front lets the UI show
// a "restricted" state instead of a misleading ₹0.
export const FINANCE_ROLES: UserRole[] = ["super_admin", "accountant"];
export const AUDIT_ROLES: UserRole[] = ["super_admin", "technical"];

// All month boundaries are computed in IST so "this month" matches what the
// team sees on the calendar, regardless of the server's timezone.
const IST_OFFSET_MS = 330 * 60 * 1000;

function istMonthStart(monthOffset = 0): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + monthOffset, 1) - IST_OFFSET_MS
  );
}

function istMonthKey(date: string | Date): string {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${ist.getUTCMonth()}`;
}

const monthLabel = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  timeZone: "Asia/Kolkata",
});

function lastSixMonths() {
  return Array.from({ length: 6 }, (_, i) => {
    const start = istMonthStart(i - 5);
    const end = istMonthStart(i - 4);
    return { key: istMonthKey(start), label: monthLabel.format(start), start, end };
  });
}

function logError(scope: string, error: { message: string } | null) {
  if (error) console.error(`[dashboard] ${scope}:`, error.message);
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface DashboardKpis {
  totalStudents: number;
  newStudentsThisMonth: number;
  studentGrowth: number | null;
  activeCourses: number;
  draftCourses: number;
  revenueThisMonth: number | null;
  revenueGrowth: number | null;
  pendingEnrollments: number | null;
}

export async function getDashboardKpis(role: UserRole): Promise<DashboardKpis> {
  const supabase = await createClient();
  const canViewFinance = FINANCE_ROLES.includes(role);

  const thisMonth = istMonthStart(0).toISOString();
  const lastMonth = istMonthStart(-1).toISOString();

  const [students, newStudents, published, drafts, revenueStats, pending] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisMonth),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("is_published", false),
    canViewFinance
      ? supabase.rpc("get_revenue_stats", {
          start_date: lastMonth,
          end_date: new Date().toISOString(),
        })
      : null,
    canViewFinance
      ? supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : null,
  ]);

  logError("students", students.error);
  logError("courses", published.error);
  logError("revenue", revenueStats?.error ?? null);

  const totalStudents = students.count ?? 0;
  const newStudentsThisMonth = newStudents.count ?? 0;

  let revenueThisMonth: number | null = null;
  let revenueGrowth: number | null = null;

  if (revenueStats?.data) {
    const stats = revenueStats.data as {
      total_revenue: number;
      total_orders: number;
      monthly_revenue: { month: string; revenue: number; order_count: number }[];
    };
    const cutoff = new Date(thisMonth).getTime();
    let current = 0;
    let previous = 0;
    for (const m of stats.monthly_revenue ?? []) {
      const amount = Number(m.revenue) || 0;
      if (new Date(m.month).getTime() >= cutoff) current += amount;
      else previous += amount;
    }
    revenueThisMonth = current;
    revenueGrowth = percentChange(current, previous);
  }

  return {
    totalStudents,
    newStudentsThisMonth,
    studentGrowth: percentChange(totalStudents, totalStudents - newStudentsThisMonth),
    activeCourses: published.count ?? 0,
    draftCourses: drafts.count ?? 0,
    revenueThisMonth,
    revenueGrowth,
    pendingEnrollments: pending ? (pending.count ?? 0) : null,
  };
}

// ---------------------------------------------------------------------------
// Monthly trends
// ---------------------------------------------------------------------------

export interface MonthlyValue {
  month: string;
  value: number;
}

export async function getRevenueTrend(): Promise<MonthlyValue[]> {
  const supabase = await createClient();
  const months = lastSixMonths();

  const { data, error } = await supabase.rpc("get_revenue_stats", {
    start_date: months[0].start.toISOString(),
    end_date: new Date().toISOString(),
  });

  logError("revenue trend", error);

  const monthlyData = (data as {
    monthly_revenue: { month: string; revenue: number }[];
  } | null)?.monthly_revenue ?? [];

  const totals = new Map(months.map((m) => [m.key, 0]));
  for (const row of monthlyData) {
    const key = istMonthKey(row.month);
    if (totals.has(key)) {
      totals.set(key, Number(row.revenue) || 0);
    }
  }

  return months.map((m) => ({ month: m.label, value: totals.get(m.key) ?? 0 }));
}

export async function getEnrollmentTrend(): Promise<MonthlyValue[]> {
  const supabase = await createClient();
  const months = lastSixMonths();

  const results = await Promise.all(
    months.map((m) =>
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .gte("purchased_at", m.start.toISOString())
        .lt("purchased_at", m.end.toISOString())
    )
  );

  return months.map((m, i) => {
    logError(`enrollments ${m.label}`, results[i].error);
    return { month: m.label, value: results[i].count ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export async function getRecentActivity(
  limit = 10
): Promise<{ items: ActivityItem[]; fetchedAt: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, new_data, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  logError("audit log", error);

  return {
    items: ((data ?? []) as AuditLogRow[]).map(toActivityItem),
    fetchedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Course performance
// ---------------------------------------------------------------------------

export interface CoursePerformance {
  id: string;
  name: string;
  is_published: boolean;
  enrollments: number;
  revenue: number | null;
  completionRate: number | null;
}

export async function getTopCourses(role: UserRole, limit = 5): Promise<CoursePerformance[]> {
  const supabase = await createClient();
  const canViewFinance = FINANCE_ROLES.includes(role);

  // Cast until `npm run db:types` is re-run against the repaired function
  // (migration 20261101200000), which is what puts it in the generated RPC
  // union. Drop the cast once the types are regenerated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_top_courses", { result_limit: limit });
  logError("top courses", error);

  const rows = (data ?? []) as {
    id: string;
    title: string;
    slug: string;
    thumbnail_url: string | null;
    is_published: boolean;
    price: number;
    enrollment_count: number;
    total_revenue: number;
  }[];

  if (!rows.length) return [];

  const completions = await Promise.all(
    rows.map((course) => getCompletionCounts(supabase, course.id))
  );

  return rows.map((course, i) => {
    const { items, completed } = completions[i];
    const possible = items * course.enrollment_count;

    return {
      id: course.id,
      name: course.title,
      is_published: course.is_published,
      enrollments: course.enrollment_count,
      revenue: canViewFinance ? course.total_revenue : null,
      completionRate: possible > 0 ? Math.min(100, (completed / possible) * 100) : null,
    };
  });
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Published items in a course and how many (student, item) pairs are marked
 * complete. Completion rate = completed / (items × enrolled students).
 */
async function getCompletionCounts(supabase: ServerClient, courseId: string) {
  const [items, completed] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, topics!inner(subjects!inner(course_id))", { count: "exact", head: true })
      .eq("status", "published")
      .eq("topics.subjects.course_id", courseId),
    supabase
      .from("student_progress")
      .select("id, content_items!inner(status, topics!inner(subjects!inner(course_id)))", {
        count: "exact",
        head: true,
      })
      .eq("status", "completed")
      .eq("content_items.status", "published")
      .eq("content_items.topics.subjects.course_id", courseId),
  ]);

  logError("content items", items.error);
  logError("student progress", completed.error);

  return { items: items.count ?? 0, completed: completed.count ?? 0 };
}
