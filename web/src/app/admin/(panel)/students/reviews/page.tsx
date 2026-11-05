import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";

import { CourseReviewsClient } from "@/components/admin/students/course-reviews-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { RATING_MODERATOR_ROLES } from "@/lib/ratings";

import { fetchCourseRatings, fetchRatingCourses } from "./actions";

export const metadata: Metadata = {
  title: "Course Reviews | Dream Edge Admin",
};

export default function CourseReviewsPage() {
  return (
    <Suspense fallback={<CourseReviewsSkeleton />}>
      <CourseReviewsContent />
    </Suspense>
  );
}

async function CourseReviewsContent() {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, RATING_MODERATOR_ROLES)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="max-w-md text-center text-muted-foreground">
          You don&apos;t have permission to moderate course reviews. Contact
          your administrator if you need access.
        </p>
      </div>
    );
  }

  const [ratings, courses] = await Promise.all([fetchCourseRatings(), fetchRatingCourses()]);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Course Reviews</h1>
        <p className="mt-1 text-muted-foreground">
          Star ratings and reviews from enrolled students. Hide anything
          abusive or personal: it leaves the course page and the average, and
          the change is recorded in the audit log.
        </p>
      </div>

      <CourseReviewsClient
        initialData={ratings.data}
        initialCount={ratings.count}
        initialError={ratings.error ?? null}
        courses={courses}
      />
    </div>
  );
}

function CourseReviewsSkeleton() {
  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
