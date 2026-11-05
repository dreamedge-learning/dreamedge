"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

const BUCKET = "content-files";

// The bucket holds documents and images only, and 40 MB is already generous
// for a print-ready booklet. The limit is set on the bucket as well, in
// 20261102200000_video_hosting_and_offline.sql; this is the copy that can
// explain itself to an admin before the upload starts.
const MAX_BYTES = 40 * 1024 * 1024;

// A video that reaches this path is an admin working in the wrong box. It
// cannot be allowed through -- it would blow the cap, and even a short one
// would sit in the bucket untranscoded, unplayable at any quality but its own
// and uncoverable by a playback token.
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|mkv|avi|wmv|flv|webm|mpe?g|3gp|ts|m2ts)$/i;

export interface ContentFile {
  id: string;
  content_item_id: string;
  storage_path: string;
  display_name: string;
  size_bytes: number;
  mime_type: string | null;
  weight: number;
  /** A PowerPoint/Word/Excel original: teachers only, never served to students. */
  is_source_document: boolean | null;
}

const SELECT =
  "id, content_item_id, storage_path, display_name, size_bytes, mime_type, weight, is_source_document";

/**
 * Strips a filename down to something safe to put in an object key, keeping
 * the extension. Storage keys are URL path segments, so anything exotic in a
 * name uploaded from a phone would have to be escaped on every read.
 */
function safeName(name: string): string {
  const trimmed = name.trim().slice(-120);
  const cleaned = trimmed
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "");

  return cleaned || "file";
}

/** The folder every file for one content item lives in. */
function folderFor(contentId: string): string {
  return `content/${contentId}/`;
}

export async function listContentFiles(contentId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data, error } = await supabase
      .from("content_files")
      .select(SELECT)
      .eq("content_item_id", parsed.data)
      .order("weight", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("listContentFiles failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    return { data: (data ?? []) as ContentFile[] };
  } catch (err) {
    console.error("listContentFiles failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Issues a one-shot upload URL for a file the browser then sends straight to
 * storage.
 *
 * The file deliberately never passes through this server. A server action
 * body is capped at 1 MB by default and Vercel refuses any request body over
 * 4.5 MB whatever the framework is configured to allow, so the old
 * upload-through-the-action path could not have carried the limit it
 * advertised. Signing here and uploading from the browser sidesteps both
 * limits and keeps the bucket private.
 *
 * The returned path is generated here rather than taken from the caller: a
 * client that chose its own key could write anywhere in the bucket.
 */
export async function createUploadTicket(
  contentId: string,
  fileName: string,
  sizeBytes: number,
  mimeType: string | null = null
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    // The extension is checked as well as the type, because a browser reports
    // an empty type for a format it does not recognise and .mkv is one of them.
    if (mimeType?.startsWith("video/") || VIDEO_EXTENSIONS.test(fileName)) {
      // Worded without pointing at a panel that may not be on screen. The
      // video uploader only renders for an item whose type is Video, so
      // telling the admin to use "the Video section above" was advice they
      // could not follow while attaching a file to a PDF or a note.
      return {
        error:
          "Videos cannot be attached as files. Set this item's type to Video "
          + "and upload it there, or attach a document instead.",
      };
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { error: "That file looks empty." };
    }
    if (sizeBytes > MAX_BYTES) {
      return { error: "File must be under 40 MB." };
    }

    // A fresh key per upload. Reusing one would collide with the CDN cache and
    // make a replaced file keep serving its predecessor.
    const path = `${folderFor(parsed.data)}${crypto.randomUUID()}-${safeName(fileName)}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("createUploadTicket failed:", error);
      return { error: "Could not start the upload. Please try again." };
    }

    return { data: { path: data.path, signedUrl: data.signedUrl } };
  } catch (err) {
    console.error("createUploadTicket failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Records a file the browser has just finished uploading.
 *
 * `path` comes back from the client, so it is checked against the folder this
 * item is allowed to own before anything is written.
 */
export async function registerContentFile(
  contentId: string,
  path: string,
  displayName: string,
  sizeBytes: number,
  mimeType: string | null
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    if (!path.startsWith(folderFor(parsed.data))) {
      return { error: "That file does not belong to this item." };
    }

    const { data: last } = await supabase
      .from("content_files")
      .select("weight")
      .eq("content_item_id", parsed.data)
      .order("weight", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("content_files")
      .insert({
        content_item_id: parsed.data,
        storage_path: path,
        display_name: displayName.trim().slice(0, 200) || "Untitled file",
        size_bytes: Math.round(sizeBytes),
        mime_type: mimeType,
        weight: (last?.weight ?? -1) + 1,
      })
      .select(SELECT)
      .single();

    if (error) {
      console.error("registerContentFile failed:", error);
      // The object is already in the bucket; leaving it there would be an
      // orphan nobody can see or remove from the panel.
      await supabase.storage.from(BUCKET).remove([path]);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { data: data as ContentFile };
  } catch (err) {
    console.error("registerContentFile failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Points an existing row at a newly uploaded object and removes the old one,
 * keeping the row's name and position. This is what "replace" means from the
 * panel: the file changes, where it sits in the list does not.
 */
export async function replaceContentFile(
  fileId: string,
  path: string,
  sizeBytes: number,
  mimeType: string | null
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("File").safeParse(fileId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: existing, error: findError } = await supabase
      .from("content_files")
      .select(SELECT)
      .eq("id", parsed.data)
      .single();

    if (findError || !existing) {
      return { error: "That file no longer exists." };
    }
    if (!path.startsWith(folderFor(existing.content_item_id))) {
      return { error: "That file does not belong to this item." };
    }

    const { data, error } = await supabase
      .from("content_files")
      .update({
        storage_path: path,
        size_bytes: Math.round(sizeBytes),
        mime_type: mimeType,
      })
      .eq("id", parsed.data)
      .select(SELECT)
      .single();

    if (error) {
      console.error("replaceContentFile failed:", error);
      await supabase.storage.from(BUCKET).remove([path]);
      return { error: "Something went wrong. Please try again." };
    }

    // Only once the row points somewhere else, or a failure above would have
    // left the row describing an object that is gone.
    await supabase.storage.from(BUCKET).remove([existing.storage_path]);

    revalidatePath("/admin/content/manager");
    return { data: data as ContentFile };
  } catch (err) {
    console.error("replaceContentFile failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function renameContentFile(fileId: string, displayName: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("File").safeParse(fileId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const name = displayName.trim().slice(0, 200);
    if (!name) return { error: "A file needs a name." };

    const { data, error } = await supabase
      .from("content_files")
      .update({ display_name: name })
      .eq("id", parsed.data)
      .select(SELECT)
      .single();

    if (error) {
      console.error("renameContentFile failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { data: data as ContentFile };
  } catch (err) {
    console.error("renameContentFile failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteContentFile(fileId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("File").safeParse(fileId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: existing } = await supabase
      .from("content_files")
      .select("id, storage_path")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!existing) return { success: true };

    const { error } = await supabase
      .from("content_files")
      .delete()
      .eq("id", parsed.data);

    if (error) {
      console.error("deleteContentFile failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    // The row is the only thing that makes an object reachable, so the object
    // goes with it. A failure here leaves a byte-cost orphan, not a bug the
    // student can see, which is why it does not fail the action.
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([existing.storage_path]);

    if (storageError) {
      console.error("deleteContentFile: object left behind", storageError);
    }

    revalidatePath("/admin/content/manager");
    return { success: true };
  } catch (err) {
    console.error("deleteContentFile failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function reorderContentFiles(
  contentId: string,
  orderedIds: string[]
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    if (orderedIds.length === 0) return { success: true };
    if (orderedIds.some((id) => !uuid("File").safeParse(id).success)) {
      return { error: "That ordering does not look right." };
    }

    // Scoped to the item on every row, so a caller cannot renumber files that
    // belong to something else by passing their ids.
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from("content_files")
          .update({ weight: index })
          .eq("id", id)
          .eq("content_item_id", parsed.data)
      )
    );

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("reorderContentFiles failed:", failed.error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { success: true };
  } catch (err) {
    console.error("reorderContentFiles failed:", err);
    return { error: describeFailure(err) };
  }
}
