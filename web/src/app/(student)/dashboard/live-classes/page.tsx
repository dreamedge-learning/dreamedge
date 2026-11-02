import type { Metadata } from "next";
import Link from "next/link";

import { LiveClassesContent } from "@/components/student/dashboard/live-classes-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Live classes",
};

export interface LiveClassSummary {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  platform: string;
  meetingUrl: string | null;
  rewatchContentId: string | null;
  teacherName: string | null;
  teacherAvatarUrl: string | null;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
  } | null;
}

interface LiveClassRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  platform: string | null;
  meeting_url: string | null;
  rewatch_content_id: string | null;
  teacher: {
    full_name: string | null;
    avatar_url: string | null;
  } | { full_name: string | null; avatar_url: string | null }[] | null;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail_url: string | null;
  } | { id: string; title: string; slug: string; thumbnail_url: string | null }[] | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toSummary(row: LiveClassRow): LiveClassSummary {
  const teacher = one(row.teacher);
  const course = one(row.course);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    platform: row.platform ?? "in_app",
    meetingUrl: row.meeting_url,
    rewatchContentId: row.rewatch_content_id,
    teacherName: teacher?.full_name ?? null,
    teacherAvatarUrl: teacher?.avatar_url ?? null,
    course: course
      ? {
          id: course.id,
          title: course.title,
          slug: course.slug,
          thumbnailUrl: course.thumbnail_url,
        }
      : null,
  };
}

/**
 * The student's live-class home: upcoming on top (anything scheduled or
 * live, closest first), past below (ended within the last 60 days). A
 * student only sees classes for the courses they are enrolled in -- the
 * course filter uses the same enrolment window the dashboard does.
 */
export default async function LiveClassesListPage() {
  const student = await requireCompleteStudentProfile(
    "/dashboard/live-classes",
  );
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, valid_until, status")
    .eq("student_id", student.id)
    .eq("status", "active");

  const courseIds = (enrollments ?? [])
    .filter((e) => !e.valid_until || new Date(e.valid_until) > new Date())
    .map((e) => e.course_id);

  if (courseIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <h1 className="text-2xl font-bold">Live classes</h1>
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            You are not enrolled in any course yet, so there are no live
            classes to show.
          </p>
          <Link
            href="/courses"
            className="mt-4 inline-flex rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange-dark"
          >
            Browse courses
          </Link>
        </div>
      </div>
    );
  }

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString();

  const select = `
    id, title, description, scheduled_at, duration_minutes, status,
    platform, meeting_url, rewatch_content_id,
    teacher:admin_users(full_name, avatar_url),
    course:courses(id, title, slug, thumbnail_url)
  `;

  const [{ data: upcomingRows }, { data: pastRows }] = await Promise.all([
    supabase
      .from("live_classes")
      .select(select)
      .in("course_id", courseIds)
      .in("status", ["scheduled", "live"])
      .order("scheduled_at", { ascending: true })
      .limit(20),
    supabase
      .from("live_classes")
      .select(select)
      .in("course_id", courseIds)
      .eq("status", "ended")
      .gte("scheduled_at", sixtyDaysAgo)
      .order("scheduled_at", { ascending: false })
      .limit(30),
  ]);

  const upcoming = ((upcomingRows ?? []) as unknown as LiveClassRow[]).map(
    toSummary,
  );
  const past = ((pastRows ?? []) as unknown as LiveClassRow[]).map(toSummary);

  return <LiveClassesContent upcoming={upcoming} past={past} />;
}
