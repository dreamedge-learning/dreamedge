"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import type { Database, Json } from "@/types/supabase";
import type { QuestionType, Difficulty } from "@/types/database";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import {
  questionBankIdSchema,
  questionBankItemSchema,
  questionBankUpdateSchema,
  testFilterSchema,
  testIdSchema,
  testPayloadSchema,
} from "@/lib/validations/test";

interface QuestionPayload {
  id?: string;
  type: QuestionType | string;
  content: string;
  options: Json | null;
  correct_answer: Json | null;
  positive_marks: number;
  negative_marks: number;
  difficulty: Difficulty | string;
  topic_tag: string | null;
  image_url: string | null;
  hint: string | null;
  weight: number;
}

interface TestPayload {
  id?: string;
  name: string;
  course_id?: string;
  instructions?: string;
  duration_minutes: number;
  max_attempts: number;
  pass_percentage: number;
  shuffle_questions: boolean;
  show_results_immediately: boolean;
  certificate_enabled: boolean;
  status: "draft" | "published";
  questions: QuestionPayload[];
}

async function upsertTest(payload: TestPayload) {
  const supabase = await createClient();

  // The builder sends every enum as a plain string; parsing is what turns them
  // into the question_type / difficulty_level / content_status literals the
  // generated types require, and it rejects bad marks and durations.
  const parsed = testPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }
  const test = parsed.data;

  const testRow = {
    name: test.name,
    course_id: test.course_id,
    instructions: test.instructions,
    duration_minutes: test.duration_minutes,
    max_attempts: test.max_attempts,
    shuffle_questions: test.shuffle_questions,
    pass_percentage: test.pass_percentage,
    show_results_immediately: test.show_results_immediately,
    certificate_enabled: test.certificate_enabled,
    status: test.status,
    updated_at: new Date().toISOString(),
  };

  let testId: string;

  if (test.id) {
    const { error } = await supabase
      .from("tests")
      .update(testRow)
      .eq("id", test.id);
    if (error) {
      console.error("upsertTest failed:", error);
      return { error: error.message };
    }
    testId = test.id;
  } else {
    const { data, error } = await supabase
      .from("tests")
      .insert({ ...testRow, created_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) {
      console.error("upsertTest failed:", error);
      return { error: error.message };
    }
    testId = data.id;
  }

  await supabase.from("questions").delete().eq("test_id", testId);

  if (test.questions.length > 0) {
    const rows = test.questions.map((q) => ({
      test_id: testId,
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
    }));

    const { error: qError } = await supabase.from("questions").insert(rows);
    if (qError) {
      console.error("upsertTest questions failed:", qError);
      return { error: qError.message };
    }
  }

  revalidatePath("/admin/content/tests");
  return { data: { id: testId } };
}

export async function saveTest(payload: TestPayload) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    return upsertTest({ ...payload, status: "draft" });
  } catch (err) {
    console.error("saveTest failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function publishTest(payload: TestPayload) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    return upsertTest({ ...payload, status: "published" });
  } catch (err) {
    console.error("publishTest failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteTest(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = testIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    await supabase.from("questions").delete().eq("test_id", parsedId.data);
    const { error } = await supabase.from("tests").delete().eq("id", parsedId.data);

    if (error) {
      console.error("deleteTest failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/tests");
    return { data: true };
  } catch (err) {
    console.error("deleteTest failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function duplicateTest(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    const supabase = await createClient();

    const parsedId = testIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("*")
      .eq("id", parsedId.data)
      .single();
    if (tErr || !test) {
      console.error("duplicateTest failed:", tErr);
      return { error: "Something went wrong. Please try again." };
    }

    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("*")
      .eq("test_id", parsedId.data)
      .order("weight");
    if (qErr) {
      console.error("duplicateTest failed:", qErr);
      return { error: "Something went wrong. Please try again." };
    }

    const { id: _oldId, created_at: _created_at, updated_at: _updated_at, ...rest } = test;
    const { data: newTest, error: insertErr } = await supabase
      .from("tests")
      .insert({
        ...rest,
        name: `${rest.name} (Copy)`,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error("duplicateTest failed:", insertErr);
      return { error: "Something went wrong. Please try again." };
    }

    if (questions && questions.length > 0) {
      const rows = questions.map(({ id: _qId, test_id: _test_id, ...qRest }) => ({
        ...qRest,
        test_id: newTest.id,
      }));
      await supabase.from("questions").insert(rows);
    }

    revalidatePath("/admin/content/tests");
    return { data: { id: newTest.id } };
  } catch (err) {
    console.error("duplicateTest failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchTests(filters?: {
  course_id?: string;
  status?: string;
}) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    const supabase = await createClient();

    const parsedFilters = testFilterSchema.safeParse({
      course_id: filters?.course_id,
      status: filters?.status,
    });

    if (!parsedFilters.success) {
      return { error: firstIssue(parsedFilters.error) };
    }

    let query = supabase
      .from("tests")
      .select("*, course:courses(id, title)")
      .order("created_at", { ascending: false });

    const courseFilter = parsedFilters.data.course_id;
    if (courseFilter && courseFilter !== "all") {
      query = query.eq("course_id", courseFilter);
    }
    const statusFilter = parsedFilters.data.status;
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("fetchTests failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    const testIds = (data || []).map((t) => t.id);
    const counts: Record<string, number> = {};

    if (testIds.length > 0) {
      const { data: qCounts } = await supabase
        .from("questions")
        .select("test_id")
        .in("test_id", testIds);

      if (qCounts) {
        for (const row of qCounts) {
          counts[row.test_id] = (counts[row.test_id] || 0) + 1;
        }
      }
    }

    const enriched = (data || []).map((t) => ({
      ...t,
      question_count: counts[t.id] || 0,
    }));

    return { data: enriched };
  } catch (err) {
    console.error("fetchTests failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchTestById(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    const supabase = await createClient();

    const parsedId = testIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("*")
      .eq("id", parsedId.data)
      .single();
    if (tErr) {
      console.error("fetchTestById failed:", tErr);
      return { error: "Something went wrong. Please try again." };
    }

    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("*")
      .eq("test_id", parsedId.data)
      .order("weight");
    if (qErr) {
      console.error("fetchTestById failed:", qErr);
      return { error: "Something went wrong. Please try again." };
    }

    return { data: { test, questions: questions || [] } };
  } catch (err) {
    console.error("fetchTestById failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchQuestionBank() {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("question_bank")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchQuestionBank failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    return { data: data || [] };
  } catch (err) {
    console.error("fetchQuestionBank failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function addToQuestionBank(question: {
  type: QuestionType | string;
  content: string;
  options: Json | null;
  correct_answer: Json;
  positive_marks: number;
  negative_marks: number;
  difficulty: Difficulty | string;
  topic_tag: string | null;
  image_url: string | null;
  hint: string | null;
}) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = questionBankItemSchema.safeParse(question);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { data, error } = await supabase
      .from("question_bank")
      .insert({
        type: parsed.data.type,
        content: parsed.data.content,
        options: parsed.data.options,
        correct_answer: parsed.data.correct_answer,
        positive_marks: parsed.data.positive_marks,
        negative_marks: parsed.data.negative_marks,
        difficulty: parsed.data.difficulty,
        topic_tag: parsed.data.topic_tag,
        image_url: parsed.data.image_url,
        hint: parsed.data.hint,
        used_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("addToQuestionBank failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/questions");
    return { data };
  } catch (err) {
    console.error("addToQuestionBank failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateQuestionBankItem(
  id: string,
  updates: Partial<{
    type: QuestionType | string;
    content: string;
    options: Json | null;
    correct_answer: Json;
    positive_marks: number;
    negative_marks: number;
    difficulty: Difficulty | string;
    topic_tag: string | null;
    image_url: string | null;
    hint: string | null;
  }>
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = questionBankIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = questionBankUpdateSchema.safeParse(updates);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const patch: Database["public"]["Tables"]["question_bank"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.type !== undefined) patch.type = parsed.data.type;
    if (parsed.data.content !== undefined) patch.content = parsed.data.content;
    if (parsed.data.options !== undefined) patch.options = parsed.data.options;
    if (parsed.data.correct_answer !== undefined) {
      patch.correct_answer = parsed.data.correct_answer;
    }
    if (parsed.data.positive_marks !== undefined) {
      patch.positive_marks = parsed.data.positive_marks;
    }
    if (parsed.data.negative_marks !== undefined) {
      patch.negative_marks = parsed.data.negative_marks;
    }
    if (parsed.data.difficulty !== undefined) patch.difficulty = parsed.data.difficulty;
    if (parsed.data.topic_tag !== undefined) patch.topic_tag = parsed.data.topic_tag;
    if (parsed.data.image_url !== undefined) patch.image_url = parsed.data.image_url;
    if (parsed.data.hint !== undefined) patch.hint = parsed.data.hint;

    const { data, error } = await supabase
      .from("question_bank")
      .update(patch)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      console.error("updateQuestionBankItem failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/questions");
    return { data };
  } catch (err) {
    console.error("updateQuestionBankItem failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteQuestionBankItem(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = questionBankIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("question_bank")
      .delete()
      .eq("id", parsedId.data);
    if (error) {
      console.error("deleteQuestionBankItem failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/questions");
    return { data: true };
  } catch (err) {
    console.error("deleteQuestionBankItem failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchCourses() {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, title")
      .order("title");
    if (error) {
      console.error("fetchCourses failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    return { data: data || [] };
  } catch (err) {
    console.error("fetchCourses failed:", err);
    return { error: describeFailure(err) };
  }
}
