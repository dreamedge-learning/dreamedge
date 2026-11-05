import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CourseDetailContent } from "@/components/student/courses/course-detail-content";
import type {
  SyllabusLesson,
  SyllabusSubject,
  SyllabusTopic,
} from "@/components/student/courses/course-syllabus";
import type { Course } from "@/types/course";

import { loadCourseReviews } from "./reviews-actions";


interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("courses")
      .select("title, description, meta_title, meta_description")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (!data) return { title: "Course Not Found" };

    return {
      title: data.meta_title || data.title,
      description: data.meta_description || data.description || `Learn with Dream Edge Online`,
    };
  } catch {
    return { title: "Course Not Found" };
  }
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let course: Course | null = null;
  let isEnrolled = false;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("courses")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (data) {
      course = {
        ...data,
        price: Number(data.price ?? 0),
        original_price: data.original_price != null ? Number(data.original_price) : null,
        student_count: Number(data.student_count ?? 0),
        rating_avg: data.rating_avg != null ? Number(data.rating_avg) : null,
        rating_count: Number(data.rating_count ?? 0),
        total_lessons: Number(data.total_lessons ?? 0),
        duration_hours: data.duration_hours != null ? Number(data.duration_hours) : null,
      } as unknown as Course;
    }

    if (course) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: student } = await supabase
            .from("students")
            .select("id")
            .eq("user_id", user.id)
            .single();

          if (student) {
            const { data: enrollment } = await supabase
              .from("enrollments")
              .select("id")
              .eq("student_id", student.id)
              .eq("course_id", course.id)
              .eq("status", "active")
              .maybeSingle();

            isEnrolled = !!enrollment;
          }
        }
      } catch {
        // Enrollments table may not exist yet
      }
    }
  } catch {
    // Table may not exist
  }

  if (!course) {
    notFound();
  }

  const [syllabus, reviews] = await Promise.all([
    fetchSyllabus(course.id),
    loadCourseReviews({ courseId: course.id, offset: 0 }),
  ]);

  return (
    <CourseDetailContent
      course={course}
      isEnrolled={isEnrolled}
      syllabus={syllabus}
      reviews={reviews}
    />
  );
}

/**
 * The syllabus, nested to whatever depth the course uses.
 *
 * `get_course_outline` is a SECURITY DEFINER function because every
 * student-facing policy on `content_items` requires an active enrolment, so a
 * visitor who has not bought the course could otherwise see no lesson list at
 * all. It returns titles, types, durations and posters -- never a file URL, a
 * Bunny GUID or anything else playable -- one row per subject, folder or
 * lesson, each naming its parent.
 *
 * Returns an empty list on failure rather than throwing: a missing syllabus
 * should cost the page its lesson list, not the whole course page.
 */
async function fetchSyllabus(courseId: string): Promise<SyllabusSubject[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_course_outline", {
      p_course_id: courseId,
    });

    if (error || !data) {
      if (error) console.error("[course] syllabus could not be read:", error);
      return [];
    }

    const byWeight = (a: { weight: number }, b: { weight: number }) => a.weight - b.weight;

    const subjects: (SyllabusSubject & { weight: number })[] = [];
    const folders = new Map<string, SyllabusTopic & { weight: number; parentId: string }>();
    const lessonsByFolder = new Map<string, (SyllabusLesson & { weight: number })[]>();

    for (const row of data) {
      if (row.node_kind === "subject") {
        subjects.push({ id: row.node_id, name: row.name, weight: row.weight ?? 0, topics: [] });
      } else if (row.node_kind === "folder") {
        folders.set(row.node_id, {
          id: row.node_id,
          name: row.name,
          weight: row.weight ?? 0,
          parentId: row.parent_id,
          folders: [],
          lessons: [],
        });
      } else if (row.node_kind === "lesson") {
        const list = lessonsByFolder.get(row.parent_id) ?? [];
        list.push({
          id: row.node_id,
          title: row.name,
          type: row.item_type,
          isPaid: row.item_is_paid,
          durationSeconds: row.item_duration ?? null,
          posterUrl: row.item_poster_url ?? null,
          weight: row.weight ?? 0,
        });
        lessonsByFolder.set(row.parent_id, list);
      }
    }

    // A folder's parent is either a subject or another folder. Attaching in a
    // second pass means the rows can arrive in any order.
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
    for (const folder of folders.values()) {
      folder.lessons = (lessonsByFolder.get(folder.id) ?? []).sort(byWeight);
      const parentFolder = folders.get(folder.parentId);
      if (parentFolder) parentFolder.folders.push(folder);
      else subjectById.get(folder.parentId)?.topics.push(folder);
    }

    function sortBranch(list: SyllabusTopic[]) {
      (list as (SyllabusTopic & { weight: number })[]).sort(byWeight);
      for (const folder of list) sortBranch(folder.folders);
    }

    subjects.sort(byWeight);
    for (const subject of subjects) sortBranch(subject.topics);
    return subjects;
  } catch (error) {
    console.error("[course] syllabus could not be read:", error);
    return [];
  }
}
