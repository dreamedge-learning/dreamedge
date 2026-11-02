import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LiveClassDetail } from "@/components/student/dashboard/live-class-detail";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Live class",
};

export interface LiveClassDetailData {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  platform: string;
  meetingUrl: string | null;
  rewatchContentId: string | null;
  rewatchCourseSlug: string | null;
  teacher: { name: string | null; avatarUrl: string | null } | null;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
  } | null;
}

interface Row {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  platform: string | null;
  meeting_url: string | null;
  rewatch_content_id: string | null;
  course_id: string;
  teacher: { full_name: string | null; avatar_url: string | null }
    | { full_name: string | null; avatar_url: string | null }[]
    | null;
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

export default async function LiveClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await requireCompleteStudentProfile(
    `/dashboard/live-classes/${id}`,
  );

  const supabase = await createClient();
  const { data } = await supabase
    .from("live_classes")
    .select(
      `
      id, title, description, scheduled_at, duration_minutes, status,
      platform, meeting_url, rewatch_content_id, course_id,
      teacher:admin_users(full_name, avatar_url),
      course:courses(id, title, slug, thumbnail_url)
    `,
    )
    .eq("id", id)
    .maybeSingle<Row>();

  if (!data) notFound();

  // Entitlement: a student only sees a class if they are enrolled in the
  // course it belongs to and the enrolment is live.
  const { data: enrolment } = await supabase
    .from("enrollments")
    .select("id, valid_until")
    .eq("student_id", student.id)
    .eq("course_id", data.course_id)
    .eq("status", "active")
    .maybeSingle();

  if (
    !enrolment ||
    (enrolment.valid_until && new Date(enrolment.valid_until) <= new Date())
  ) {
    notFound();
  }

  // For the rewatch deep-link we need the course slug the content item
  // lives under -- that's the one the learn page keys on.
  let rewatchCourseSlug: string | null = null;
  if (data.rewatch_content_id) {
    const { data: content } = await supabase
      .from("content_items")
      .select(
        `topic:topics(subject:subjects(course:courses(slug)))`,
      )
      .eq("id", data.rewatch_content_id)
      .maybeSingle<{
        topic:
          | {
              subject:
                | { course: { slug: string } | { slug: string }[] | null }
                | { course: { slug: string } | { slug: string }[] | null }[]
                | null;
            }
          | {
              subject:
                | { course: { slug: string } | { slug: string }[] | null }
                | { course: { slug: string } | { slug: string }[] | null }[]
                | null;
            }[]
          | null;
      }>();
    const topic = one(content?.topic);
    const subject = one(topic?.subject);
    const course = one(subject?.course);
    rewatchCourseSlug = course?.slug ?? null;
  }

  const teacher = one(data.teacher);
  const course = one(data.course);

  const detail: LiveClassDetailData = {
    id: data.id,
    title: data.title,
    description: data.description,
    scheduledAt: data.scheduled_at,
    durationMinutes: data.duration_minutes,
    status: data.status,
    platform: data.platform ?? "in_app",
    meetingUrl: data.meeting_url,
    rewatchContentId: data.rewatch_content_id,
    rewatchCourseSlug,
    teacher: teacher
      ? { name: teacher.full_name, avatarUrl: teacher.avatar_url }
      : null,
    course: course
      ? {
          id: course.id,
          title: course.title,
          slug: course.slug,
          thumbnailUrl: course.thumbnail_url,
        }
      : null,
  };

  return <LiveClassDetail detail={detail} />;
}
