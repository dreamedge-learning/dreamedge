import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import { formatINR, formatNumber } from "@/lib/format";
import type { CoursePerformance as CoursePerformanceRow } from "@/lib/dashboard";

function CompletionBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <div className="h-full rounded-full bg-brand-orange" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums">{Math.round(value)}%</span>
    </div>
  );
}

export function CoursePerformance({ courses }: { courses: CoursePerformanceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Course Performance</CardTitle>
        <CardDescription>Top courses by enrollment</CardDescription>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Once you publish a course, its enrollments and revenue will be tracked here."
            action={
              <Link
                href="/admin/content"
                className="inline-flex h-8 items-center rounded-lg bg-brand-orange px-3 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90"
              >
                Create a course
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Enrollments</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="w-8">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id} className="group">
                  <TableCell className="max-w-56">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/content/courses/${course.id}`}
                        className="truncate font-medium hover:text-brand-orange hover:underline"
                      >
                        {course.name}
                      </Link>
                      {!course.is_published && (
                        <Badge variant="outline">
                          Draft
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(course.enrollments)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {course.revenue === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatINR(course.revenue)
                    )}
                  </TableCell>
                  <TableCell>
                    <CompletionBar value={course.completionRate} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/content/courses/${course.id}`}
                      aria-label={`Open ${course.name}`}
                      className="flex justify-end text-muted-foreground group-hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function CoursePerformanceSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
