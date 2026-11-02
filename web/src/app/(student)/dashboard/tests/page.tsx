import type { Metadata } from "next";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { TestsContent } from "@/components/student/dashboard/tests-content";


export const metadata: Metadata = {
  title: "Tests",
  description: "Your test history, scores, and upcoming assessments on Dream Edge.",
};

export interface TestAttemptRow {
  id: string;
  test_id: string;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  time_taken_seconds: number | null;
  attempt_number: number;
  submitted_at: string;
  test: {
    id: string;
    name: string;
    duration_minutes: number;
    pass_percentage: number | null;
    course_id: string | null;
    course: { id: string; title: string; slug: string } | null;
  } | null;
}

export interface UpcomingTestRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  pass_percentage: number | null;
  start_time: string | null;
  end_time: string | null;
  max_attempts: number;
  attempts_so_far: number;
  course: { id: string; title: string; slug: string } | null;
}

async function fetchAttempts(studentId: string): Promise<TestAttemptRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("test_attempts")
      .select(
        `id, test_id, score, total_marks, percentage, time_taken_seconds,
         attempt_number, submitted_at,
         test:tests(
           id, name, duration_minutes, pass_percentage, course_id,
           course:courses(id, title, slug)
         )`
      )
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(100);
    return (data as unknown as TestAttemptRow[]) ?? [];
  } catch {
    return [];
  }
}

async function fetchUpcoming(studentId: string): Promise<UpcomingTestRow[]> {
  try {
    const supabase = await createClient();

    // Which courses is this student enrolled in?
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, valid_until, status")
      .eq("student_id", studentId)
      .eq("status", "active");
    const courseIds = (enrollments ?? [])
      .filter((e) => !e.valid_until || new Date(e.valid_until) > new Date())
      .map((e) => e.course_id);
    if (courseIds.length === 0) return [];

    // Published tests for those courses, with end_time in the future (or null)
    const nowIso = new Date().toISOString();
    const { data: tests } = await supabase
      .from("tests")
      .select(
        `id, name, description, duration_minutes, pass_percentage,
         start_time, end_time, max_attempts, course_id,
         course:courses(id, title, slug)`
      )
      .in("course_id", courseIds)
      .eq("status", "published")
      .or(`end_time.is.null,end_time.gt.${nowIso}`)
      .order("start_time", { ascending: true, nullsFirst: false });

    if (!tests) return [];

    // Count prior attempts per test
    const testIds = tests.map((t) => t.id);
    const { data: attemptCounts } = await supabase
      .from("test_attempts")
      .select("test_id")
      .eq("student_id", studentId)
      .in("test_id", testIds);

    const counts = new Map<string, number>();
    for (const a of attemptCounts ?? []) {
      counts.set(a.test_id, (counts.get(a.test_id) ?? 0) + 1);
    }

    return tests.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      duration_minutes: t.duration_minutes,
      pass_percentage: t.pass_percentage,
      start_time: t.start_time,
      end_time: t.end_time,
      max_attempts: t.max_attempts,
      attempts_so_far: counts.get(t.id) ?? 0,
      course: Array.isArray(t.course)
        ? (t.course[0] as UpcomingTestRow["course"])
        : (t.course as UpcomingTestRow["course"]),
    }));
  } catch {
    return [];
  }
}

export default async function TestsPage() {
  const student = await requireCompleteStudentProfile("/dashboard/tests");
  const [attempts, upcoming] = await Promise.all([
    fetchAttempts(student.id),
    fetchUpcoming(student.id),
  ]);
  return <TestsContent attempts={attempts} upcoming={upcoming} />;
}
