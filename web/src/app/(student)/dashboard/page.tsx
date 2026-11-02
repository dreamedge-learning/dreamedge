import type { Metadata } from "next";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/student/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface CourseProgressSummary {
  total: number;
  completed: number;
  pct: number;
  lastActivityAt: string | null;
}

interface ProgressSnapshot {
  byCourse: Map<string, CourseProgressSummary>;
  totalItems: number;
  completedItems: number;
  completedSeconds: number;
}

const EMPTY_SNAPSHOT: ProgressSnapshot = {
  byCourse: new Map(),
  totalItems: 0,
  completedItems: 0,
  completedSeconds: 0,
};

function blankSummaries(courseIds: string[]): Map<string, CourseProgressSummary> {
  return new Map(
    courseIds.map((id) => [
      id,
      { total: 0, completed: 0, pct: 0, lastActivityAt: null },
    ])
  );
}

async function fetchActiveEnrollments(studentId: string) {
  try {
    const supabase = await createClient();
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, purchased_at, valid_until, status, course_id")
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("purchased_at", { ascending: false });

    if (!enrollments || enrollments.length === 0) return [];

    const live = enrollments.filter(
      (e) => !e.valid_until || new Date(e.valid_until) > new Date()
    );
    if (live.length === 0) return [];

    const { data: courses } = await supabase
      .from("courses")
      .select("id, title, slug, thumbnail_url, class")
      .in(
        "id",
        live.map((e) => e.course_id)
      );

    const courseMap = new Map((courses ?? []).map((c) => [c.id, c]));

    return live.map((e) => ({
      id: e.id,
      course_id: e.course_id,
      purchased_at: e.purchased_at,
      valid_until: e.valid_until,
      status: e.status,
      course: courseMap.get(e.course_id) ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Walks the real content hierarchy — subjects -> topics -> content_items —
 * and joins it to `student_progress` (which keys on content_item_id) to get
 * per-course totals plus the aggregate numbers the stat cards show. The old
 * `lessons` table was never written to, so nothing reads it any more.
 */
async function fetchProgressSnapshot(
  studentId: string,
  courseIds: string[]
): Promise<ProgressSnapshot> {
  if (courseIds.length === 0) return EMPTY_SNAPSHOT;

  try {
    const supabase = await createClient();

    const { data: subjects } = await supabase
      .from("subjects")
      .select("id, course_id")
      .in("course_id", courseIds)
      .eq("is_visible", true);

    if (!subjects || subjects.length === 0) {
      return { ...EMPTY_SNAPSHOT, byCourse: blankSummaries(courseIds) };
    }

    const { data: topics } = await supabase
      .from("topics")
      .select("id, subject_id")
      .in(
        "subject_id",
        subjects.map((s) => s.id)
      )
      .eq("is_visible", true);

    if (!topics || topics.length === 0) {
      return { ...EMPTY_SNAPSHOT, byCourse: blankSummaries(courseIds) };
    }

    const { data: items } = await supabase
      .from("content_items")
      .select("id, topic_id, duration_seconds")
      .in(
        "topic_id",
        topics.map((t) => t.id)
      )
      .eq("status", "published");

    if (!items || items.length === 0) {
      return { ...EMPTY_SNAPSHOT, byCourse: blankSummaries(courseIds) };
    }

    const courseOfSubject = new Map(subjects.map((s) => [s.id, s.course_id]));
    const courseOfTopic = new Map<string, string>();
    for (const topic of topics) {
      const courseId = courseOfSubject.get(topic.subject_id);
      if (courseId) courseOfTopic.set(topic.id, courseId);
    }

    const byCourse = blankSummaries(courseIds);
    const courseOfItem = new Map<string, string>();
    const durationOfItem = new Map<string, number>();

    for (const item of items) {
      const courseId = courseOfTopic.get(item.topic_id);
      if (!courseId) continue;
      courseOfItem.set(item.id, courseId);
      durationOfItem.set(item.id, Number(item.duration_seconds ?? 0));

      const summary = byCourse.get(courseId);
      if (summary) summary.total += 1;
    }

    const { data: progress } = await supabase
      .from("student_progress")
      .select("content_item_id, status, progress_percentage, completed_at, updated_at")
      .eq("student_id", studentId)
      .in("content_item_id", Array.from(courseOfItem.keys()));

    let completedItems = 0;
    let completedSeconds = 0;

    for (const row of progress ?? []) {
      const courseId = courseOfItem.get(row.content_item_id);
      if (!courseId) continue;
      const summary = byCourse.get(courseId);
      if (!summary) continue;

      const touchedAt: string | null = row.updated_at ?? row.completed_at ?? null;
      if (
        touchedAt &&
        (!summary.lastActivityAt ||
          new Date(touchedAt) > new Date(summary.lastActivityAt))
      ) {
        summary.lastActivityAt = touchedAt;
      }

      if (row.status === "completed") {
        summary.completed += 1;
        completedItems += 1;
        completedSeconds += durationOfItem.get(row.content_item_id) ?? 0;
      }
    }

    let totalItems = 0;
    for (const summary of byCourse.values()) {
      summary.pct =
        summary.total > 0
          ? Math.round((summary.completed / summary.total) * 100)
          : 0;
      totalItems += summary.total;
    }

    return { byCourse, totalItems, completedItems, completedSeconds };
  } catch {
    return { ...EMPTY_SNAPSHOT, byCourse: blankSummaries(courseIds) };
  }
}

async function fetchUpcomingLiveClasses(studentId: string) {
  try {
    const supabase = await createClient();
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, valid_until, status")
      .eq("student_id", studentId)
      .eq("status", "active");
    const courseIds = (enrollments ?? [])
      .filter((e) => !e.valid_until || new Date(e.valid_until) > new Date())
      .map((e) => e.course_id);
    if (courseIds.length === 0) return [];

    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("live_classes")
      .select(
        `id, title, scheduled_at, duration_minutes, meeting_url, platform, status,
         course:courses(id, title, slug)`
      )
      .in("course_id", courseIds)
      .in("status", ["scheduled", "live"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(3);
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const student = await requireCompleteStudentProfile("/dashboard");

  const [enrollments, upcomingClasses] = await Promise.all([
    fetchActiveEnrollments(student.id),
    fetchUpcomingLiveClasses(student.id),
  ]);

  const snapshot = await fetchProgressSnapshot(
    student.id,
    enrollments.map((e) => e.course_id)
  );

  // Continue learning: whatever the student touched most recently comes first,
  // then the newest purchase.
  const ordered = [...enrollments].sort((a, b) => {
    const aAt = snapshot.byCourse.get(a.course_id)?.lastActivityAt;
    const bAt = snapshot.byCourse.get(b.course_id)?.lastActivityAt;
    if (aAt && bAt) return new Date(bAt).getTime() - new Date(aAt).getTime();
    if (aAt) return -1;
    if (bAt) return 1;
    return (
      new Date(b.purchased_at ?? 0).getTime() -
      new Date(a.purchased_at ?? 0).getTime()
    );
  });

  const hoursLearned =
    Math.round((snapshot.completedSeconds / 3600) * 10) / 10;

  const avgProgress =
    snapshot.totalItems > 0
      ? Math.round((snapshot.completedItems / snapshot.totalItems) * 100)
      : 0;

  return (
    <DashboardContent
      student={{ ...student, email: student.email ?? "" }}
      enrollments={ordered}
      progressByCourse={Object.fromEntries(snapshot.byCourse)}
      upcomingClasses={
        upcomingClasses as unknown as import("@/components/student/dashboard/dashboard-content").UpcomingLiveClass[]
      }
      stats={{
        enrolledCourses: enrollments.length,
        completedLessons: snapshot.completedItems,
        hoursLearned,
        avgProgress,
      }}
    />
  );
}
