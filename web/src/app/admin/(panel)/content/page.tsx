import { Suspense } from "react";
import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/admin/content/course-card";
import { CourseListControls } from "@/components/admin/content/course-list-controls";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import type { CourseWithCategory } from "@/types/course";

interface SearchParams {
  status?: string;
  category?: string;
  q?: string;
  page?: string;
  view?: string;
}

const PAGE_SIZE = 10;

async function getCourses(params: SearchParams) {
  const supabase = await createClient();
  const page = Math.max(1, parseInt(params.page as string, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("courses")
    .select(
      `
      *,
      course_categories (id, name, thumbnail_url, weight),
      enrollments:enrollments(count)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.status && params.status !== "all") {
    query = query.eq("is_published", params.status === "published");
  }

  if (params.q) {
    query = query.ilike("title", `%${params.q}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    // Returning an empty list on error renders the "No courses yet" empty
    // state, which reads as "the table is empty" rather than "the query
    // failed" - that hid a broken course_categories embed. Log it so the
    // next failure is visible.
    console.error("getCourses failed:", error);
    return { courses: [], total: 0 };
  }

  const courses: CourseWithCategory[] = (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    enrollment_count: Array.isArray(row.enrollments)
      ? (row.enrollments[0] as { count: number })?.count || 0
      : 0,
  })) as CourseWithCategory[];

  return { courses, total: count || 0 };
}

async function getCategories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_categories")
    .select("id, name")
    .order("weight");
  return data || [];
}

async function CourseGrid({ searchParams }: { searchParams: SearchParams }) {
  const [{ courses, total }, categories] = await Promise.all([
    getCourses(searchParams),
    getCategories(),
  ]);

  const page = Math.max(1, parseInt(searchParams.page as string, 10) || 1);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (courses.length === 0 && page === 1) {
    const hasFilters =
      searchParams.status || searchParams.category || searchParams.q;

    return (
      <EmptyState
        icon={BookOpen}
        title={hasFilters ? "No courses match your filters" : "No courses yet"}
        description={
          hasFilters
            ? "Try adjusting your search or filters"
            : "Create your first course to get started!"
        }
        action={
          !hasFilters ? (
            <Button render={<Link href="/admin/content/courses/new" />} className="bg-brand-orange hover:bg-brand-orange-dark text-white">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Course
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <CourseListControls
        categories={categories}
        currentStatus={searchParams.status}
        currentCategory={searchParams.category}
        currentSearch={searchParams.q}
        currentView={searchParams.view}
      />

      {/* Course grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total} courses
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={{
                      pathname: "/admin/content",
                      query: { ...searchParams, page: String(page - 1) },
                    }}
                  />
                }
              >
                Previous
              </Button>
            )}
            {page < totalPages && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={{
                      pathname: "/admin/content",
                      query: { ...searchParams, page: String(page + 1) },
                    }}
                  />
                }
              >
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="ml-auto h-9 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-0">
            <Skeleton className="aspect-video w-full rounded-t-xl" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-3 h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Manage your course catalog
          </p>
        </div>
        <Button render={<Link href="/admin/content/courses/new" />} className="bg-brand-orange hover:bg-brand-orange-dark text-white">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Course
        </Button>
      </div>

      <Suspense fallback={<GridSkeleton />}>
        <CourseGrid searchParams={params} />
      </Suspense>
    </div>
  );
}
