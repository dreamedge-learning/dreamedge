import type { Metadata } from "next";

import { LeaderboardContent } from "@/components/student/dashboard/leaderboard-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Weekly rankings for your enrolled courses on Dream Edge.",
};

export interface LeaderboardEnrollment {
  course_id: string;
  course_title: string;
}

async function fetchActiveEnrollments(
  studentId: string
): Promise<LeaderboardEnrollment[]> {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, valid_until, status")
    .eq("student_id", studentId)
    .eq("status", "active");

  const live = (enrollments ?? []).filter(
    (e) => !e.valid_until || new Date(e.valid_until) > new Date()
  );
  if (live.length === 0) return [];

  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .in(
      "id",
      live.map((e) => e.course_id)
    );

  const byId = new Map((courses ?? []).map((c) => [c.id, c.title]));
  return live
    .map((e) => ({
      course_id: e.course_id,
      course_title: byId.get(e.course_id) ?? "Course",
    }))
    .sort((a, b) => a.course_title.localeCompare(b.course_title));
}

export default async function LeaderboardPage() {
  const student = await requireCompleteStudentProfile("/dashboard/leaderboard");
  const enrollments = await fetchActiveEnrollments(student.id);
  return <LeaderboardContent enrollments={enrollments} />;
}
