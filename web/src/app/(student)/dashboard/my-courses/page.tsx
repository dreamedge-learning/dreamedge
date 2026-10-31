import type { Metadata } from "next";

import { requireStudent } from "@/lib/auth-student";
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

export default async function MyCoursesPage() {
  const student = await requireStudent();
  const enrollments = await fetchEnrollments(student.id);

  const courseIds = enrollments
    .filter((e) => e.course != null)
    .map((e) => e.course_id);

  const progressMap = await fetchCourseProgress(student.id, courseIds);

  const progressData: Record<string, CourseProgress> = {};
  for (const [courseId, summary] of progressMap) {
    progressData[courseId] = summary;
  }

  return <MyCoursesContent enrollments={enrollments} progress={progressData} />;
}
