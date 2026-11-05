"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth-guard";
import { HIDE_REASON_MAX, HIDE_REASON_MIN, RATING_MODERATOR_ROLES } from "@/lib/ratings";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

/**
 * Course ratings moderation.
 *
 * Reads and writes run on the admin's own session, so the table's policies
 * back up every role check here: only super admin and support staff can read
 * other students' ratings, and `set_course_rating_hidden` re-checks the role,
 * requires a reason to hide, and writes the audit log entry in the same
 * transaction as the change.
 */

export interface AdminRatingRow {
  id: string;
  courseId: string;
  courseTitle: string | null;
  studentId: string;
  studentName: string;
  studentClass: string | null;
  studentCode: string | null;
  stars: number;
  review: string | null;
  isHidden: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRatingFilters {
  status?: string;
  courseId?: string;
  stars?: number | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

const filterSchema = z.object({
  status: z.enum(["all", "visible", "hidden"]).default("all"),
  courseId: z.union([z.literal("all"), z.string().uuid()]).default("all"),
  stars: z.number().int().min(1).max(5).nullable().default(null),
  search: z.string().trim().max(100, "Search is too long.").default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

const moderateSchema = z
  .object({
    ratingId: uuid("Review"),
    hidden: z.boolean(),
    reason: z.string().trim().max(HIDE_REASON_MAX, "That reason is too long.").default(""),
  })
  .refine((v) => !v.hidden || v.reason.length >= HIDE_REASON_MIN, {
    message: "Give a reason for hiding this review.",
    path: ["reason"],
  });

export async function fetchCourseRatings(filters: AdminRatingFilters = {}) {
  try {
    await assertAdmin(RATING_MODERATOR_ROLES);

    const parsed = filterSchema.safeParse(filters);
    if (!parsed.success) {
      return { data: [] as AdminRatingRow[], count: 0, error: firstIssue(parsed.error) };
    }

    const { status, courseId, stars, search, page, pageSize } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("admin_list_course_ratings", {
      p_status: status === "all" ? undefined : status,
      p_course_id: courseId === "all" ? undefined : courseId,
      p_stars: stars ?? undefined,
      p_search: search || undefined,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });

    if (error) {
      console.error("fetchCourseRatings failed:", error);
      return { data: [] as AdminRatingRow[], count: 0, error: "Could not load reviews." };
    }

    const rows = data ?? [];
    return {
      data: rows.map(
        (row): AdminRatingRow => ({
          id: row.id,
          courseId: row.course_id,
          courseTitle: row.course_title ?? null,
          studentId: row.student_id,
          studentName: row.student_name,
          studentClass: row.student_class ?? null,
          studentCode: row.student_code ?? null,
          stars: row.stars,
          review: row.review ?? null,
          isHidden: row.is_hidden,
          hiddenAt: row.hidden_at ?? null,
          hiddenReason: row.hidden_reason ?? null,
          hiddenByName: row.hidden_by_name ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      ),
      // Every row carries the full total; an empty page has none to read.
      count: rows.length > 0 ? Number(rows[0].total_count) : 0,
      error: undefined,
    };
  } catch (err) {
    console.error("fetchCourseRatings failed:", err);
    return { data: [] as AdminRatingRow[], count: 0, error: describeFailure(err) };
  }
}

/** Courses for the filter. Every course, published or not. */
export async function fetchRatingCourses() {
  try {
    await assertAdmin(RATING_MODERATOR_ROLES);
    const supabase = await createClient();
    const { data, error } = await supabase.from("courses").select("id, title").order("title");

    if (error) {
      console.error("fetchRatingCourses failed:", error);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** Hides a review from the course page and the average, or restores it. */
export async function setReviewHidden(input: {
  ratingId: string;
  hidden: boolean;
  reason?: string;
}): Promise<{ error?: string }> {
  try {
    await assertAdmin(RATING_MODERATOR_ROLES);

    const parsed = moderateSchema.safeParse(input);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_course_rating_hidden", {
      p_rating_id: parsed.data.ratingId,
      p_hidden: parsed.data.hidden,
      p_reason: parsed.data.reason || undefined,
    });

    if (error) {
      console.error("setReviewHidden failed:", error);
      // The function words its own refusals for a person.
      return {
        error:
          error.code === "22023" || error.code === "P0002" || error.code === "42501"
            ? error.message
            : "Could not update the review.",
      };
    }

    revalidatePath("/admin/students/reviews");
    revalidatePath("/courses/[slug]", "page");
    revalidatePath("/courses");
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("setReviewHidden failed:", err);
    return { error: describeFailure(err) };
  }
}
