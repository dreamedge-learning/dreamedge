/**
 * Doubts: a student's question on a lesson, answered by a teacher.
 *
 * Shared by the student pages, the admin inbox and the composer both of them
 * use, so it holds nothing that only works on one side of the network. The
 * rules that matter -- who may ask, about which lesson, how often, with which
 * photo -- live in the database (`20261105081317_doubts.sql`); the limits here
 * mirror them so a form can say "too short" before a round trip, not instead
 * of one.
 */

import type { UserRole } from "@/types/database";

/**
 * Who sees the inbox and who may answer from it. Support staff see the queue
 * because they field the "nobody answered my question" calls; answering and
 * closing are for teachers and the super admin. The table's policies say the
 * same, so these only decide what the panel shows.
 */
export const DOUBT_READ_ROLES: UserRole[] = ["super_admin", "teacher", "support_staff"];
export const DOUBT_ANSWER_ROLES: UserRole[] = ["super_admin", "teacher"];

export const DOUBT_IMAGE_BUCKET = "doubt-images";

/** Mirrors `doubts_body_length`. */
export const DOUBT_BODY_MIN = 5;
export const DOUBT_BODY_MAX = 2000;

/** Mirrors `doubt_replies_body_length`. */
export const REPLY_BODY_MIN = 1;
export const REPLY_BODY_MAX = 2000;

/** The bucket's own ceiling. Photos are scaled down well below it first. */
export const DOUBT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const DOUBT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Signed image links last long enough to read a thread, not to share one. */
export const DOUBT_IMAGE_URL_TTL_SECONDS = 10 * 60;

export type DoubtStatus = "open" | "answered" | "closed";

export const DOUBT_STATUSES: readonly DoubtStatus[] = ["open", "answered", "closed"];

export function isDoubtStatus(value: unknown): value is DoubtStatus {
  return typeof value === "string" && (DOUBT_STATUSES as readonly string[]).includes(value);
}

/** Labels written for the student. The admin inbox uses its own wording. */
export const STUDENT_STATUS_LABEL: Record<DoubtStatus, string> = {
  open: "Waiting for a teacher",
  answered: "Answered",
  closed: "Closed",
};

export const STAFF_STATUS_LABEL: Record<DoubtStatus, string> = {
  open: "Unanswered",
  answered: "Answered",
  closed: "Closed",
};

export const DOUBT_STATUS_STYLES: Record<DoubtStatus, string> = {
  open: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  answered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

export interface DoubtMessage {
  id: string;
  author: "student" | "admin";
  authorName: string;
  body: string;
  /** A signed link, minted when the thread was loaded. Null when no photo. */
  imageUrl: string | null;
  createdAt: string;
}

export interface DoubtThread {
  id: string;
  status: DoubtStatus;
  contentItemId: string;
  lessonTitle: string | null;
  courseTitle: string | null;
  courseSlug: string | null;
  createdAt: string;
  updatedAt: string;
  /** The opening question, then every reply, oldest first. */
  messages: DoubtMessage[];
}

/** One row of the student's "My doubts" list. */
export interface DoubtSummary {
  id: string;
  status: DoubtStatus;
  body: string;
  lessonTitle: string | null;
  courseTitle: string | null;
  replyCount: number;
  updatedAt: string;
}

interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Turns a refusal from the doubt tables into something a student can act on.
 *
 * The triggers already word their own refusals for a person (rate limit, a
 * closed doubt, a photo that is not theirs), so those pass straight through.
 * An RLS refusal has a message written for developers, and the only way a
 * real student meets one is by asking about a lesson they no longer have.
 */
export function describeDoubtError(error: DatabaseError | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";

  switch (error.code) {
    case "PT429":
    case "22023":
    case "P0002":
      return error.message || "Something went wrong. Please try again.";
    case "42501":
      if (error.message && !error.message.includes("row-level security")) {
        return error.message;
      }
      return "You can only ask about lessons in a course you are enrolled in.";
    case "23514":
      return "Please write a little more so your teacher understands the question.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Where a lesson opens on the website, for the "Open lesson" links. */
export function lessonHref(courseSlug: string | null, contentItemId: string): string | null {
  if (!courseSlug) return null;
  return `/courses/${courseSlug}/learn?content=${contentItemId}`;
}
