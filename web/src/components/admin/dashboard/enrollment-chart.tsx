"use client";

import { UserPlus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { formatNumber } from "@/lib/format";
import type { MonthlyValue } from "@/lib/dashboard";

export function EnrollmentChart({ data }: { data: MonthlyValue[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrollments</CardTitle>
        <CardDescription>
          Last 6 months · {formatNumber(total)} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No enrollments yet"
            description="New course enrollments will be charted here as students join."
            className="h-64"
          />
        ) : (
          // Brand dark blue disappears on a dark background, so lift it in dark mode.
          <div className="h-64 [--bar:var(--color-brand-blue)] dark:[--bar:#6B85BC]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={48}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {formatNumber(Number(payload[0].value))} enrollments
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" fill="var(--bar)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
