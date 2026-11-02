import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TestRunner } from "@/components/student/tests/test-runner";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Taking test",
};

interface TestRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  pass_percentage: number | null;
  negative_marking: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean | null;
  max_attempts: number | null;
  status: string;
}

/**
 * Entry point for taking a published test.
 *
 * The RPC `start_test_attempt` is the one that actually gates the student
 * (enrolment, test publication window, max_attempts). This page only
 * fetches the metadata the runner needs to render -- the paper itself and
 * the server-side clock come through the RPC on the client.
 */
export default async function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCompleteStudentProfile(`/dashboard/tests/${id}/take`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("tests")
    .select(
      `id, name, description, duration_minutes, pass_percentage,
       negative_marking, shuffle_questions, shuffle_options,
       show_results_immediately, max_attempts, status`
    )
    .eq("id", id)
    .maybeSingle<TestRow>();

  if (!data || data.status !== "published") {
    notFound();
  }

  return (
    <TestRunner
      test={{
        id: data.id,
        name: data.name,
        description: data.description,
        durationMinutes: data.duration_minutes,
        passPercentage: data.pass_percentage,
        negativeMarking: data.negative_marking,
        showResultsImmediately: data.show_results_immediately ?? true,
      }}
    />
  );
}
