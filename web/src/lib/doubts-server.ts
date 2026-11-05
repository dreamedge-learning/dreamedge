import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DOUBT_IMAGE_BUCKET,
  DOUBT_IMAGE_URL_TTL_SECONDS,
  isDoubtStatus,
  type DoubtMessage,
  type DoubtThread,
} from "@/lib/doubts";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;

/**
 * Signs every photo in one round trip.
 *
 * The bucket is private, so a thread is only readable with links minted for
 * the person looking at it. Signing runs as the caller -- the storage policies
 * decide which objects they may have -- so a path that slipped into a thread
 * they should not see simply comes back unsigned and renders as no image.
 */
export async function signDoubtImages(
  supabase: Client,
  paths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const signed = new Map<string, string>();
  if (unique.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(DOUBT_IMAGE_BUCKET)
    .createSignedUrls(unique, DOUBT_IMAGE_URL_TTL_SECONDS);

  if (error) {
    console.error("signDoubtImages failed:", error);
    return signed;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/** PostgREST returns a to-one embed as an object, but types it loosely. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface ThreadRow {
  id: string;
  status: string;
  body: string;
  image_path: string | null;
  content_item_id: string;
  created_at: string;
  updated_at: string;
  student: { full_name: string } | { full_name: string }[] | null;
  content_item: { title: string } | { title: string }[] | null;
  course: { title: string; slug: string } | { title: string; slug: string }[] | null;
  doubt_replies: {
    id: string;
    author_kind: string;
    author_name: string;
    body: string;
    image_path: string | null;
    created_at: string;
  }[];
}

const THREAD_COLUMNS = `
  id, status, body, image_path, content_item_id, created_at, updated_at,
  student:students(full_name),
  content_item:content_items(title),
  course:courses(title, slug),
  doubt_replies(id, author_kind, author_name, body, image_path, created_at)
`;

/**
 * Loads whole threads -- the question and every reply -- with their photos
 * signed for the caller.
 *
 * Which threads come back is RLS's decision, not the filter's: a student who
 * passes somebody else's doubt id gets an empty list. The filters only narrow
 * what the caller may already read.
 */
export async function loadDoubtThreads(
  supabase: Client,
  filter: { doubtId?: string; contentItemId?: string; studentId?: string }
): Promise<DoubtThread[]> {
  let query = supabase
    .from("doubts")
    .select(THREAD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);

  if (filter.doubtId) query = query.eq("id", filter.doubtId);
  if (filter.contentItemId) query = query.eq("content_item_id", filter.contentItemId);
  if (filter.studentId) query = query.eq("student_id", filter.studentId);

  const { data, error } = await query;
  if (error) {
    // Thrown, not returned empty: "you have no doubts" is the wrong thing to
    // tell a student whose doubts exist but could not be read.
    throw error;
  }

  const rows = (data ?? []) as unknown as ThreadRow[];
  const images = await signDoubtImages(
    supabase,
    rows.flatMap((row) => [row.image_path, ...row.doubt_replies.map((r) => r.image_path)])
  );

  return rows.map((row) => {
    const replies = [...row.doubt_replies].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const course = one(row.course);

    const opening: DoubtMessage = {
      id: row.id,
      author: "student",
      authorName: one(row.student)?.full_name ?? "Student",
      body: row.body,
      imageUrl: row.image_path ? images.get(row.image_path) ?? null : null,
      createdAt: row.created_at,
    };

    return {
      id: row.id,
      status: isDoubtStatus(row.status) ? row.status : "open",
      contentItemId: row.content_item_id,
      lessonTitle: one(row.content_item)?.title ?? null,
      courseTitle: course?.title ?? null,
      courseSlug: course?.slug ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: [
        opening,
        ...replies.map(
          (reply): DoubtMessage => ({
            id: reply.id,
            author: reply.author_kind === "admin" ? "admin" : "student",
            authorName: reply.author_name,
            body: reply.body,
            imageUrl: reply.image_path ? images.get(reply.image_path) ?? null : null,
            createdAt: reply.created_at,
          })
        ),
      ],
    };
  });
}
