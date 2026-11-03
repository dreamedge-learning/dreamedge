"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend,
} from "recharts";
import { formatINR, formatINRCompact } from "@/lib/format";
import type { MonthlyRevenue, DailyOrder, PaymentMethodBreakdown, CourseRevenue } from "@/app/admin/(panel)/revenue/actions";

const BRAND_ORANGE = "var(--color-brand-orange)";
const CHART_COLORS = [
  "var(--color-brand-orange)",
  "var(--color-brand-blue)",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  razorpay: "Online",
  manual_cash: "Cash",
  manual_upi: "UPI",
  manual_bank: "Bank",
};

interface MonthlyRevenueChartProps {
  data: MonthlyRevenue[];
}

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function MonthlyRevenueChart({ data }: MonthlyRevenueChartProps) {
  const chartData = [...data]
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
    .map((d) => ({
      name: monthFormatter.format(new Date(d.month)),
      revenue: d.revenue,
      orders: d.orderCount,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Monthly Revenue</CardTitle>
        <CardDescription>Revenue trend over time</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No revenue data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_ORANGE} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={BRAND_ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis tickFormatter={(v) => formatINRCompact(v)} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <Tooltip
                formatter={(value) => [formatINR(Number(value)), "Revenue"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={BRAND_ORANGE}
                strokeWidth={2}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface DailyOrdersChartProps {
  data: DailyOrder[];
}

export function DailyOrdersChart({ data }: DailyOrdersChartProps) {
  const dayFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  const chartData = [...data]
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime())
    .map((d) => ({
      name: dayFormatter.format(new Date(d.day)),
      orders: d.orderCount,
      revenue: d.revenue,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily Orders</CardTitle>
        <CardDescription>Order count per day</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No orders in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <Tooltip
                formatter={(value, name) => [
                  name === "revenue" ? formatINR(Number(value)) : value,
                  name === "revenue" ? "Revenue" : "Orders",
                ]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
              <Bar dataKey="orders" fill={BRAND_ORANGE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface PaymentMethodChartProps {
  data: PaymentMethodBreakdown[];
}

export function PaymentMethodChart({ data }: PaymentMethodChartProps) {
  const chartData = data.map((d) => ({
    name: PAYMENT_METHOD_LABELS[d.method] ?? d.method,
    value: d.totalAmount,
    count: d.orderCount,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payment Methods</CardTitle>
        <CardDescription>Revenue by payment method</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No data available.
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CourseRevenueChartProps {
  data: CourseRevenue[];
}

export function CourseRevenueChart({ data }: CourseRevenueChartProps) {
  const chartData = data
    .slice(0, 8)
    .map((d) => {
      const label = d.name ?? "";
      return {
        name: label.length > 20 ? label.slice(0, 20) + "…" : label,
        revenue: d.totalRevenue,
        enrollments: d.enrollmentCount,
      };
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Revenue by Course</CardTitle>
        <CardDescription>Top courses by revenue</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No course data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickFormatter={(v) => formatINRCompact(v)} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                formatter={(value) => [formatINR(Number(value)), "Revenue"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
              <Bar dataKey="revenue" fill={BRAND_ORANGE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton() {
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
