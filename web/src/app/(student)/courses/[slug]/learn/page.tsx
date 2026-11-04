import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/types/course";
import { LearnContent } from "@/components/student/courses/learn-content";
import type {
  ContentAttachment,
  ContentItemType,
  ContentProgress,
  SyllabusContentItem,
  SyllabusSubject,
} from "@/components/student/courses/learn-content";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ content?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  return {
    title: course ? `${course.title} — Learn` : "Course Not Found",
  };
}

/** Last extension on a path, lowercased and without the dot. */
function extensionOf(value: string): string | null {
  const path = value.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");

  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Loads every file attached to the given items, grouped by item and left in
 * the order the admin arranged them.
 *
 * The objects live in a private bucket, so what the player gets is never a
 * storage URL: each file is addressed through the content route, which
 * rechecks enrolment and signs a short-lived link at the moment it is opened.
 * The extension is read off the stored path, since the route's own URL carries
 * none and the player needs to know what it is about to embed.
 */
async function fetchFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[]
): Promise<Map<string, ContentAttachment[]>> {
  const byItem = new Map<string, ContentAttachment[]>();
  if (itemIds.length === 0) return byItem;

  const { data } = await supabase
    .from("content_files")
    .select("id, content_item_id, display_name, size_bytes, storage_path")
    .in("content_item_id", itemIds)
    // RLS already withholds PowerPoint and Word originals from students; this
    // says so where the query is, rather than relying on the reader knowing.
    .eq("is_source_document", false)
    .order("weight", { ascending: true })
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    const list = byItem.get(row.content_item_id) ?? [];

    list.push({
      id: row.id,
      name: row.display_name,
      ext: extensionOf(row.storage_path),
      sizeBytes: row.size_bytes,
      url: `/api/content/${row.content_item_id}/file?f=${row.id}`,
    });

    byItem.set(row.content_item_id, list);
  }

  return byItem;
}

/**
 * Loads the published syllabus for a course: subjects -> topics ->
 * content_items, each level ordered by `weight`. Row-level security already
 * hides unpublished and unpaid-for items, so an empty result here is a real
 * empty state, not an error.
 */
async function fetchSyllabus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  studentId: string
): Promise<SyllabusSubject[]> {
  const { data: subjectRows } = await supabase
    .from("subjects")
    .select("id, name, color_code, weight")
    .eq("course_id", courseId)
    .eq("is_visible", true)
    .order("weight", { ascending: true })
    .order("created_at", { ascending: true });

  const subjects = subjectRows ?? [];
  if (subjects.length === 0) return [];

  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, subject_id, name, description, weight")
    .in(
      "subject_id",
      subjects.map((s) => s.id)
    )
    .eq("is_visible", true)
    .order("weight", { ascending: true })
    .order("created_at", { ascending: true });

  const topics = topicRows ?? [];

  let items: SyllabusContentItem[] = [];
  if (topics.length > 0) {
    const { data: itemRows } = await supabase
      .from("content_items")
      .select(
        "id, topic_id, type, title, description, file_url, video_id, video_provider, video_status, duration_seconds, is_paid, is_downloadable, is_printable, play_limit, weight"
      )
      .in(
        "topic_id",
        topics.map((t) => t.id)
      )
      .eq("status", "published")
      .order("weight", { ascending: true })
      .order("created_at", { ascending: true });

    const filesByItem = await fetchFiles(
      supabase,
      (itemRows ?? []).map((row) => row.id)
    );

    items = (itemRows ?? []).map((row) => {
      return {
        id: row.id,
        topic_id: row.topic_id,
        type: row.type as ContentItemType,
        title: row.title,
        description: row.description,
        file_url: row.file_url,
        files: filesByItem.get(row.id) ?? [],
        video_id: row.video_id,
        video_provider: row.video_provider,
        video_status: row.video_status,
        duration_seconds: row.duration_seconds,
        is_paid: row.is_paid,
        is_downloadable: row.is_downloadable,
        is_printable: row.is_printable,
        play_limit: row.play_limit,
        weight: row.weight,
        progress: null,
      };
    });
  }

  const progressById = await fetchProgress(
    supabase,
    studentId,
    items.map((i) => i.id)
  );

  const itemsByTopic = new Map<string, SyllabusContentItem[]>();
  for (const item of items) {
    const list = itemsByTopic.get(item.topic_id) ?? [];
    list.push({ ...item, progress: progressById.get(item.id) ?? null });
    itemsByTopic.set(item.topic_id, list);
  }

  const topicsBySubject = new Map<string, typeof topics>();
  for (const topic of topics) {
    const list = topicsBySubject.get(topic.subject_id) ?? [];
    list.push(topic);
    topicsBySubject.set(topic.subject_id, list);
  }

  return subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    color_code: subject.color_code,
    weight: subject.weight,
    topics: (topicsBySubject.get(subject.id) ?? []).map((topic) => ({
      id: topic.id,
      name: topic.name,
      description: topic.description,
      weight: topic.weight,
      items: itemsByTopic.get(topic.id) ?? [],
    })),
  }));
}

/** `student_progress` keys on content_item_id, one row per item per student. */
async function fetchProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  contentItemIds: string[]
): Promise<Map<string, ContentProgress>> {
  const map = new Map<string, ContentProgress>();
  if (contentItemIds.length === 0) return map;

  const { data } = await supabase
    .from("student_progress")
    .select("content_item_id, status, progress_percentage, last_position_seconds")
    .eq("student_id", studentId)
    .in("content_item_id", contentItemIds);

  for (const row of data ?? []) {
    const status = row.status === "completed" || row.status === "in_progress"
      ? row.status
      : "not_started";

    map.set(row.content_item_id, {
      status,
      progressPct: Math.round(Number(row.progress_percentage ?? 0)),
      lastPositionSeconds: Math.round(Number(row.last_position_seconds ?? 0)),
    });
  }

  return map;
}

export default async function LearnPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { content: initialContentId } = (await searchParams) ?? {};
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!course) notFound();

  const student = await requireCompleteStudentProfile(`/courses/${slug}/learn`);

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, valid_until")
    .eq("student_id", student.id)
    .eq("course_id", course.id)
    .eq("status", "active")
    .maybeSingle();

  const isEnrolled =
    !!enrollment &&
    (!enrollment.valid_until || new Date(enrollment.valid_until) > new Date());

  if (!isEnrolled) {
    redirect(`/courses/${slug}`);
  }

  const subjects = await fetchSyllabus(supabase, course.id, student.id);

  return (
    <LearnContent
      course={course as Course}
      subjects={subjects}
      initialContentId={
        typeof initialContentId === "string" ? initialContentId : null
      }
    />
  );
}
