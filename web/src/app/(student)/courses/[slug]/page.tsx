import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CourseDetailContent } from "@/components/student/courses/course-detail-content";
import type {
  SyllabusSubject,
} from "@/components/student/courses/course-syllabus";
import type { Course } from "@/types/course";


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

  const syllabus = await fetchSyllabus(course.id);

  return (
    <CourseDetailContent
      course={course}
      isEnrolled={isEnrolled}
      syllabus={syllabus}
    />
  );
}

/**
 * The syllabus, nested.
 *
 * `get_course_syllabus` is a SECURITY DEFINER function because every
 * student-facing policy on `content_items` requires an active enrolment, so a
 * visitor who has not bought the course could otherwise see no lesson list at
 * all. It returns titles, types, durations and posters -- never a file URL, a
 * Bunny GUID or anything else playable.
 *
 * Returns an empty list on failure rather than throwing: a missing syllabus
 * should cost the page its lesson list, not the whole course page.
 */
async function fetchSyllabus(courseId: string): Promise<SyllabusSubject[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_course_syllabus", {
      p_course_id: courseId,
    });

    if (error || !data) {
      if (error) console.error("[course] syllabus could not be read:", error);
      return [];
    }

    const subjects: SyllabusSubject[] = [];
    const subjectIndex = new Map<string, number>();
    const topicIndex = new Map<string, number>();

    // The rows arrive already ordered by subject, topic and lesson weight, so
    // first-seen order is the right order and nothing needs re-sorting.
    for (const row of data) {
      if (!subjectIndex.has(row.subject_id)) {
        subjectIndex.set(row.subject_id, subjects.length);
        subjects.push({ id: row.subject_id, name: row.subject_name, topics: [] });
      }
      const subject = subjects[subjectIndex.get(row.subject_id)!];

      const topicKey = `${row.subject_id}:${row.topic_id}`;
      if (!topicIndex.has(topicKey)) {
        topicIndex.set(topicKey, subject.topics.length);
        subject.topics.push({ id: row.topic_id, name: row.topic_name, lessons: [] });
      }
      const topic = subject.topics[topicIndex.get(topicKey)!];

      // A topic with no published lessons comes back as one row with null
      // lesson columns, courtesy of the left join. That is a topic worth
      // showing -- it tells a buyer what is coming -- but not a lesson.
      if (row.item_id) {
        topic.lessons.push({
          id: row.item_id,
          title: row.item_title,
          type: row.item_type,
          isPaid: row.item_is_paid,
          durationSeconds: row.item_duration ?? null,
          posterUrl: row.item_poster_url ?? null,
        });
      }
    }

    return subjects;
  } catch (error) {
    console.error("[course] syllabus could not be read:", error);
    return [];
  }
}
