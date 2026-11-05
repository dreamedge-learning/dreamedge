"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseRatingStars } from "@/components/student/dashboard/course-rating-stars";
import type { MyCourseRating } from "@/lib/ratings";
import type { EnrollmentWithCourse } from "@/types/enrollment";

interface CourseProgress {
  total: number;
  completed: number;
  pct: number;
}

interface MyCoursesContentProps {
  enrollments: EnrollmentWithCourse[];
  progress: Record<string, CourseProgress>;
  ratings: Record<string, MyCourseRating>;
}

export function MyCoursesContent({
  enrollments,
  progress,
  ratings,
}: MyCoursesContentProps) {
  const activeCourses = enrollments.filter((e) => e.course != null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          My Courses
        </h1>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {activeCourses.length}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Continue where you left off
      </p>

      {activeCourses.length === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            No courses yet
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Browse our course catalog to get started
          </p>
          <Button
            className="mt-5 bg-brand-orange text-white hover:bg-brand-orange-dark"
            render={<Link href="/courses" />}
          >
            Browse Courses
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeCourses.map((enrollment) => {
            const course = enrollment.course!;
            const cp = progress[enrollment.course_id];
            const pct = cp?.pct ?? 0;
            const completed = cp?.completed ?? 0;
            const total = cp?.total ?? 0;
            const href = `/courses/${course.slug}/learn`;

            // The card is no longer a single Link: the star control must sit
            // outside the anchor, or clicks on it would navigate into the
            // course, and nesting buttons inside <a> is invalid HTML.
            return (
              <div
                key={enrollment.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link href={href} className="block">
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-brand-orange/20 to-brand-blue/20">
                    {course.thumbnail_url ? (
                      <Image
                        src={course.thumbnail_url}
                        alt={course.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-3xl font-bold text-brand-orange/30">
                          DE
                        </span>
                      </div>
                    )}
                    {course.class && (
                      <Badge className="absolute left-2.5 top-2.5 bg-black/70 text-white backdrop-blur-sm">
                        {course.class}
                      </Badge>
                    )}
                  </div>
                </Link>

                {/* Card body */}
                <div className="flex flex-1 flex-col p-4">
                  <Link href={href} className="block">
                    <h3 className="line-clamp-2 text-sm font-semibold text-card-foreground">
                      {course.title}
                    </h3>
                    {course.teacher_name && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {course.teacher_name}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {total > 0 && (
                        <span>
                          {completed} of {total} lessons
                        </span>
                      )}
                      {total === 0 && course.total_lessons > 0 && (
                        <span>{course.total_lessons} lessons</span>
                      )}
                      {course.duration_hours && (
                        <>
                          <span aria-hidden="true">&middot;</span>
                          <span>{course.duration_hours}h</span>
                        </>
                      )}
                    </div>

                    {/* Progress */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pct}% complete</span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-orange transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </Link>

                  {/* Rating + continue */}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <CourseRatingStars
                      courseId={enrollment.course_id}
                      courseTitle={course.title}
                      initial={ratings[enrollment.course_id]}
                    />
                    <Link
                      href={href}
                      className="flex shrink-0 items-center text-sm font-medium text-brand-orange hover:text-brand-orange-dark"
                    >
                      Continue
                      <ChevronRight className="ml-0.5 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
