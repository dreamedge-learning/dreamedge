import { createClient } from "@/lib/supabase/server";
import { fetchDoubtInbox, type DoubtInboxRow } from "@/app/admin/(panel)/doubts/actions";

/**
 * The teacher dashboard's reads.
 *
 * Everything here runs on the teacher's own session, so the row-level policies
 * decide what comes back and these functions only narrow it. A teacher may
 * read every live class, doubt, enrollment and progress row (the admin-read
 * and staff-read policies in 20261030000000_rls_role_model.sql and
 * 20261105081317_doubts.sql), so nothing here needs the service role or a
 * SECURITY DEFINER helper. All of it is read-only.
 *
 * A teacher is tied to a course through the live classes assigned to them --
 * live_classes.teacher_id is the only link between an admin and a course in
 * the schema -- so "the courses they teach" means the courses they are
 * scheduled to take a class for.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

function logError(scope: string, error: { message: string } | null | undefined) {
  if (error) console.error(`[teaching] ${scope}:`, error.message);
}

/** Distinct courses a teacher is scheduled to take a live class for. */
async function teachingCourseIds(
  supabase: ServerClient,
  teacherId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("live_classes")
    .select("course_id")
    .eq("teacher_id", teacherId);

  logError("course ids", error);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.course_id) ids.add(row.course_id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Live classes
// ---------------------------------------------------------------------------

export interface TeacherLiveClass {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduledAt: string;
  durationMinutes: number;
  platform: string | null;
  meetingUrl: string | null;
  attendeeCount: number;
  courseTitle: string | null;
  courseSlug: string | null;
}

export interface TeacherLiveClasses {
  upcoming: TeacherLiveClass[];
  recent: TeacherLiveClass[];
}

interface LiveClassRow {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  platform: string | null;
  meeting_url: string | null;
  attendee_count: number | null;
  course: { title: string; slug: string } | { title: string; slug: string }[] | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const LIVE_STATUSES: TeacherLiveClass["status"][] = [
  "scheduled",
  "live",
  "ended",
  "cancelled",
];

function liveStatus(value: string): TeacherLiveClass["status"] {
  return (LIVE_STATUSES as string[]).includes(value)
    ? (value as TeacherLiveClass["status"])
    : "scheduled";
}

function toLiveClass(row: LiveClassRow): TeacherLiveClass {
  const course = one(row.course);
  return {
    id: row.id,
    title: row.title,
    status: liveStatus(row.status),
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    platform: row.platform,
    meetingUrl: row.meeting_url,
    attendeeCount: row.attendee_count ?? 0,
    courseTitle: course?.title ?? null,
    courseSlug: course?.slug ?? null,
  };
}

/**
 * The teacher's classes, split into what is still to come (anything not yet
 * ended or cancelled, soonest first) and what has wrapped up (ended or
 * cancelled, most recent first). Status drives the split rather than the
 * clock, to match the admin live-classes screen.
 */
export async function getTeacherLiveClasses(
  teacherId: string,
  recentLimit = 5
): Promise<TeacherLiveClasses> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("live_classes")
    .select(
      `id, title, status, scheduled_at, duration_minutes, platform, meeting_url,
       attendee_count, course:courses(title, slug)`
    )
    .eq("teacher_id", teacherId)
    .order("scheduled_at", { ascending: true });

  logError("live classes", error);

  const rows = (data ?? []) as unknown as LiveClassRow[];
  const upcoming: TeacherLiveClass[] = [];
  const recent: TeacherLiveClass[] = [];

  for (const row of rows) {
    const cls = toLiveClass(row);
    if (cls.status === "ended" || cls.status === "cancelled") recent.push(cls);
    else upcoming.push(cls);
  }

  // Finished classes read best newest-first, and only the last handful matter.
  recent.reverse();
  return { upcoming, recent: recent.slice(0, recentLimit) };
}

// ---------------------------------------------------------------------------
// Doubts
// ---------------------------------------------------------------------------

export interface TeacherDoubtSummary {
  open: number;
  assignedToMe: number;
  recent: DoubtInboxRow[];
}

/**
 * What the teacher has to answer: how many questions are unanswered, how many
 * are on their own plate, and the most recent open ones to jump straight into.
 * The recent list comes through the same inbox query the Doubts screen uses,
 * so it honours the same policies and search rules.
 */
export async function getTeacherDoubtSummary(
  teacherId: string,
  recentLimit = 5
): Promise<TeacherDoubtSummary> {
  const supabase = await createClient();

  const [openResult, assignedResult, recentResult] = await Promise.all([
    supabase
      .from("doubts")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("doubts")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", teacherId)
      .neq("status", "closed"),
    fetchDoubtInbox({ status: "open", page: 1, pageSize: recentLimit }),
  ]);

  logError("open doubts", openResult.error);
  logError("assigned doubts", assignedResult.error);

  return {
    open: openResult.count ?? 0,
    assignedToMe: assignedResult.count ?? 0,
    recent: recentResult.data,
  };
}

// ---------------------------------------------------------------------------
// Student progress for the courses they teach
// ---------------------------------------------------------------------------

export interface TeacherCourseProgress {
  id: string;
  title: string;
  isPublished: boolean;
  activeStudents: number;
  completionRate: number | null;
}

/**
 * Published items in a course and how many (student, item) pairs are marked
 * complete, so completion = completed / (items × active students). This is the
 * same shape the super-admin course table uses; it is recomputed here rather
 * than shared so the two dashboards stay independent.
 */
async function getCompletionCounts(supabase: ServerClient, courseId: string) {
  const [items, completed] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, topics!inner(subjects!inner(course_id))", {
        count: "exact",
        head: true,
      })
      .eq("status", "published")
      .eq("topics.subjects.course_id", courseId),
    supabase
      .from("student_progress")
      .select("id, content_items!inner(status, topics!inner(subjects!inner(course_id)))", {
        count: "exact",
        head: true,
      })
      .eq("status", "completed")
      .eq("content_items.status", "published")
      .eq("content_items.topics.subjects.course_id", courseId),
  ]);

  logError("content items", items.error);
  logError("student progress", completed.error);

  return { items: items.count ?? 0, completed: completed.count ?? 0 };
}

/**
 * A read-only roll-up of the courses the teacher takes classes for: how many
 * students are actively enrolled and how far they have worked through the
 * published lessons.
 */
export async function getTeacherCourseProgress(
  teacherId: string
): Promise<TeacherCourseProgress[]> {
  const supabase = await createClient();
  const courseIds = await teachingCourseIds(supabase, teacherId);
  if (courseIds.length === 0) return [];

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, is_published")
    .in("id", courseIds)
    .order("title", { ascending: true });

  logError("courses", error);

  const rows = (courses ?? []) as {
    id: string;
    title: string;
    is_published: boolean;
  }[];
  if (rows.length === 0) return [];

  const [enrollments, completions] = await Promise.all([
    Promise.all(
      rows.map((course) =>
        supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("course_id", course.id)
          .eq("status", "active")
      )
    ),
    Promise.all(rows.map((course) => getCompletionCounts(supabase, course.id))),
  ]);

  return rows.map((course, i) => {
    logError(`enrollments ${course.id}`, enrollments[i].error);
    const activeStudents = enrollments[i].count ?? 0;
    const { items, completed } = completions[i];
    const possible = items * activeStudents;

    return {
      id: course.id,
      title: course.title,
      isPublished: course.is_published,
      activeStudents,
      completionRate: possible > 0 ? Math.min(100, (completed / possible) * 100) : null,
    };
  });
}
