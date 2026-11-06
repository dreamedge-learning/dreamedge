import { GraduationCap } from "lucide-react";
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
import { formatNumber } from "@/lib/format";
import type { TeacherCourseProgress } from "@/lib/teaching";

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

export function CourseProgress({ courses }: { courses: TeacherCourseProgress[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Progress</CardTitle>
        <CardDescription>How your courses are tracking</CardDescription>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No courses assigned"
            description="When you are scheduled to take a class for a course, its enrollments and completion will show up here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Active students</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="max-w-56">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{course.title}</span>
                      {!course.isPublished && <Badge variant="outline">Draft</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(course.activeStudents)}
                  </TableCell>
                  <TableCell>
                    <CompletionBar value={course.completionRate} />
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

export function CourseProgressSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-44" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
