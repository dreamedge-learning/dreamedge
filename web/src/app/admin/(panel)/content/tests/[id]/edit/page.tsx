import { notFound } from "next/navigation";
import { TestBuilder } from "@/components/admin/tests/test-builder";
import { fetchTestById, fetchCourses } from "../../actions";

export const metadata = { title: "Edit Test — Dream Edge Admin" };

export default async function EditTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [testResult, coursesResult] = await Promise.all([
    fetchTestById(id),
    fetchCourses(),
  ]);

  if (testResult.error || !testResult.data) return notFound();

  const { test, questions } = testResult.data;

  const initialTest = {
    id: test.id,
    settings: {
      name: test.name,
      course_id: test.course_id || "",
      instructions: test.instructions || "",
      duration_minutes: test.duration_minutes,
      max_attempts: test.max_attempts,
      pass_percentage: test.pass_percentage ?? 40,
      shuffle_questions: test.shuffle_questions,
      show_results_immediately: test.show_results_immediately,
      certificate_enabled: test.certificate_enabled,
      negative_marking: false,
    },
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      content: q.content,
      options: q.options,
      correct_answer: q.correct_answer,
      positive_marks: q.positive_marks,
      negative_marks: q.negative_marks,
      difficulty: q.difficulty,
      topic_tag: q.topic_tag,
      image_url: q.image_url,
      hint: q.hint,
      weight: q.weight,
      is_required: q.is_required ?? true,
    })),
  };

  return (
    <TestBuilder courses={coursesResult.data || []} initialTest={initialTest} />
  );
}
