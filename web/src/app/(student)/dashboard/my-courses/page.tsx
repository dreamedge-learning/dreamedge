import type { Metadata } from "next";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import type { EnrollmentWithCourse } from "@/types/enrollment";
import { MyCoursesContent } from "@/components/student/dashboard/my-courses-content";

export const metadata: Metadata = {
  title: "My Courses",
};

interface CourseProgress {
  total: number;
  completed: number;
  pct: number;
}

async function fetchEnrollments(
  studentId: string
): Promise<EnrollmentWithCourse[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("enrollments")
      .select(
        `
        id, student_id, course_id, status, payment_id, payment_order_id,
        payment_amount, payment_method, payment_status, purchased_at,
        valid_until, created_at, updated_at,
        course:courses(
          id, title, slug, thumbnail_url, class, subject,
          teacher_name, total_lessons, duration_hours
        )
      `
      )
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("purchased_at", { ascending: false });

    if (error) return [];
    return (data as unknown as EnrollmentWithCourse[]) ?? [];
  } catch {
    return [];
  }
}

function blankProgress(courseIds: string[]): Map<string, CourseProgress> {
  return new Map(
    courseIds.map((id) => [id, { total: 0, completed: 0, pct: 0 }])
  );
}

/**
 * Per-course completion, counted over the published content the admin panel
 * actually writes: subjects -> topics -> content_items, joined to
 * `student_progress` on content_item_id. RLS hides anything unpublished or
 * not paid for, so a course with no accessible items reports 0 of 0.
 */
async function fetchCourseProgress(
  studentId: string,
  courseIds: string[]
): Promise<Map<string, CourseProgress>> {
  if (courseIds.length === 0) return new Map();

  try {
    const supabase = await createClient();

    const { data: subjects } = await supabase
      .from("subjects")
      .select("id, course_id")
      .in("course_id", courseIds)
      .eq("is_visible", true);

    if (!subjects || subjects.length === 0) return blankProgress(courseIds);

    const { data: topics } = await supabase
      .from("topics")
      .select("id, subject_id")
      .in(
        "subject_id",
        subjects.map((s) => s.id)
      )
      .eq("is_visible", true);

    if (!topics || topics.length === 0) return blankProgress(courseIds);

    const { data: items } = await supabase
      .from("content_items")
      .select("id, topic_id")
      .in(
        "topic_id",
        topics.map((t) => t.id)
      )
      .eq("status", "published");

    if (!items || items.length === 0) return blankProgress(courseIds);

    const courseOfSubject = new Map(subjects.map((s) => [s.id, s.course_id]));
    const courseOfTopic = new Map<string, string>();
    for (const topic of topics) {
      const courseId = courseOfSubject.get(topic.subject_id);
      if (courseId) courseOfTopic.set(topic.id, courseId);
    }

    const progressMap = blankProgress(courseIds);
    const courseOfItem = new Map<string, string>();

    for (const item of items) {
      const courseId = courseOfTopic.get(item.topic_id);
      if (!courseId) continue;
      courseOfItem.set(item.id, courseId);
      const summary = progressMap.get(courseId);
      if (summary) summary.total += 1;
    }

    const { data: progress } = await supabase
      .from("student_progress")
      .select("content_item_id, status")
      .eq("student_id", studentId)
      .eq("status", "completed")
      .in("content_item_id", Array.from(courseOfItem.keys()));

    for (const row of progress ?? []) {
      const courseId = courseOfItem.get(row.content_item_id);
      if (!courseId) continue;
      const summary = progressMap.get(courseId);
      if (summary) summary.completed += 1;
    }

    for (const summary of progressMap.values()) {
      summary.pct =
        summary.total > 0
          ? Math.round((summary.completed / summary.total) * 100)
          : 0;
    }

    return progressMap;
  } catch {
    return blankProgress(courseIds);
  }
}

interface CourseRatingRow {
  course_id: string;
  stars: number;
}

/**
 * Loads the student's existing ratings for the courses on this page. One
 * query, keyed on the enrolment list rather than fetching every row the
 * student has ever written, so an old rating for a course they no longer
 * see here is naturally excluded.
 *
 * `course_ratings` is not yet in the generated supabase.ts types -- we were
 * explicitly asked not to regenerate the file on this change -- so the
 * table name is cast once and the row shape is declared locally.
 */
async function fetchStudentRatings(
  studentId: string,
  courseIds: string[]
): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  try {
    const supabase = await createClient();
    const q = supabase.from("course_ratings" as never) as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (
            col: string,
            vals: string[]
          ) => Promise<{
            data: CourseRatingRow[] | null;
            error: unknown;
          }>;
        };
      };
    };
    const { data, error } = await q
      .select("course_id, stars")
      .eq("student_id", studentId)
      .in("course_id", courseIds);
    if (error || !data) return {};
    const map: Record<string, number> = {};
    for (const row of data) {
      map[row.course_id] = row.stars;
    }
    return map;
  } catch {
    return {};
  }
}

export default async function MyCoursesPage() {
  const student = await requireCompleteStudentProfile("/dashboard/my-courses");
  const enrollments = await fetchEnrollments(student.id);

  const courseIds = enrollments
    .filter((e) => e.course != null)
    .map((e) => e.course_id);

  const [progressMap, ratings] = await Promise.all([
    fetchCourseProgress(student.id, courseIds),
    fetchStudentRatings(student.id, courseIds),
  ]);

  const progressData: Record<string, CourseProgress> = {};
  for (const [courseId, summary] of progressMap) {
    progressData[courseId] = summary;
  }

  return (
    <MyCoursesContent
      enrollments={enrollments}
      progress={progressData}
      ratings={ratings}
    />
  );
}
