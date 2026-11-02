import { Suspense } from "react";
import Link from "next/link";
import { Printer, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentTable } from "@/components/admin/students/student-table";
import { getAdminSession } from "@/lib/admin";
import { fetchStudents, fetchCoursesList } from "./actions";

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-lg border border-border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function StudentTableLoader() {
  const [studentsResult, courses] = await Promise.all([
    fetchStudents({ page: 1, pageSize: 20 }),
    fetchCoursesList(),
  ]);

  return (
    <StudentTable
      initialData={(studentsResult.data ?? []) as unknown as Parameters<typeof StudentTable>[0]["initialData"]}
      initialCount={studentsResult.count ?? 0}
      courses={courses}
    />
  );
}

export default async function StudentsPage() {
  const admin = await getAdminSession();

  // Counter registration belongs to whoever is behind the counter. A content
  // creator or a teacher has no business creating student accounts, and the
  // page itself redirects them, so hiding the buttons is just the courtesy of
  // not offering a door that is locked.
  const canRegister =
    admin?.role_name === "super_admin" || admin?.role_name === "support_staff";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground mt-1">
            Manage student profiles, track enrollments, and monitor progress.
          </p>
        </div>

        {canRegister && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/students/registration-form" />}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Printable form
            </Button>
            <Button
              size="sm"
              className="bg-brand-orange text-white hover:bg-brand-orange-dark"
              render={<Link href="/admin/students/new" />}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Register student
            </Button>
          </div>
        )}
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <StudentTableLoader />
      </Suspense>
    </div>
  );
}
