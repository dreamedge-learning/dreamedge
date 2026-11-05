"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getStudent } from "@/lib/auth-student";
import {
  DOUBT_BODY_MAX,
  DOUBT_BODY_MIN,
  REPLY_BODY_MAX,
  REPLY_BODY_MIN,
  describeDoubtError,
  type DoubtThread,
} from "@/lib/doubts";
import { loadDoubtThreads } from "@/lib/doubts-server";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, uuid } from "@/lib/validations/form";

/**
 * The student's side of doubts.
 *
 * Every write goes through the student's own session, so the database's
 * triggers and policies are what actually decide: these actions validate the
 * shape early to give a quicker message, then pass the refusal through when
 * the database says no.
 */

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const imagePathSchema = z.string().trim().min(1).max(300).nullable();

const askSchema = z.object({
  contentItemId: uuid("Lesson"),
  body: z
    .string()
    .trim()
    .min(DOUBT_BODY_MIN, `Please write at least ${DOUBT_BODY_MIN} characters.`)
    .max(DOUBT_BODY_MAX, "Your doubt is too long."),
  imagePath: imagePathSchema,
});

const replySchema = z.object({
  doubtId: uuid("Doubt"),
  body: z
    .string()
    .trim()
    .min(REPLY_BODY_MIN, "Please write a message.")
    .max(REPLY_BODY_MAX, "Your message is too long."),
  imagePath: imagePathSchema,
});

const SIGNED_OUT = "Please sign in again to continue.";

/** The student's own doubts on one lesson, newest first. */
export async function listLessonDoubts(contentItemId: string): Promise<Result<DoubtThread[]>> {
  const parsed = uuid("Lesson").safeParse(contentItemId);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const student = await getStudent();
    if (!student) return { error: SIGNED_OUT };

    const supabase = await createClient();
    const threads = await loadDoubtThreads(supabase, {
      contentItemId: parsed.data,
      studentId: student.id,
    });
    return { data: threads };
  } catch (err) {
    console.error("listLessonDoubts failed:", err);
    return { error: "Your doubts could not be loaded. Please try again." };
  }
}

export async function askDoubt(input: {
  contentItemId: string;
  body: string;
  imagePath: string | null;
}): Promise<Result<DoubtThread>> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const student = await getStudent();
    if (!student) return { error: SIGNED_OUT };

    const supabase = await createClient();
    // student_id and course_id are filled in by the database from the
    // session and the lesson; anything sent for them would be overwritten.
    const { data: created, error } = await supabase
      .from("doubts")
      .insert({
        content_item_id: parsed.data.contentItemId,
        body: parsed.data.body,
        image_path: parsed.data.imagePath,
      })
      .select("id")
      .single();

    if (error || !created) {
      if (error && error.code !== "PT429") console.error("askDoubt failed:", error);
      return { error: describeDoubtError(error) };
    }

    const [thread] = await loadDoubtThreads(supabase, { doubtId: created.id });
    revalidatePath("/dashboard/doubts");
    return thread ? { data: thread } : { error: "Your doubt was sent, but could not be shown. Please refresh." };
  } catch (err) {
    console.error("askDoubt failed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function replyToDoubt(input: {
  doubtId: string;
  body: string;
  imagePath: string | null;
}): Promise<Result<DoubtThread>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const student = await getStudent();
    if (!student) return { error: SIGNED_OUT };

    const supabase = await createClient();
    const { error } = await supabase.from("doubt_replies").insert({
      doubt_id: parsed.data.doubtId,
      body: parsed.data.body,
      image_path: parsed.data.imagePath,
    });

    if (error) {
      if (error.code !== "PT429") console.error("replyToDoubt failed:", error);
      return { error: describeDoubtError(error) };
    }

    const [thread] = await loadDoubtThreads(supabase, { doubtId: parsed.data.doubtId });
    revalidatePath("/dashboard/doubts");
    revalidatePath(`/dashboard/doubts/${parsed.data.doubtId}`);
    return thread ? { data: thread } : { error: "Your message was sent, but could not be shown. Please refresh." };
  } catch (err) {
    console.error("replyToDoubt failed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
