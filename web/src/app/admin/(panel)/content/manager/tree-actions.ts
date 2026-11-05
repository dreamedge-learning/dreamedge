"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import { deleteVideo, isBunnyConfigured } from "@/lib/bunny";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";
import { moveTargetSchema, treeKindSchema } from "@/lib/validations/content";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type TreeKind = "subject" | "topic" | "content";

const FILES_BUCKET = "content-files";
const POSTER_BUCKET = "lesson-posters";
// Every extension uploadLessonPoster can write. Removing a name that does not
// exist is a no-op, so asking for all of them is cheaper than looking first.
const POSTER_EXTENSIONS = ["jpg", "png", "webp", "avif"];

/**
 * Everything at and below one node of a course.
 *
 * A subject reaches every folder in its branch directly through subject_id,
 * which the database keeps equal to the root subject at any depth. A folder
 * has no such shortcut, so its descendants are walked from the subject's
 * folders in memory -- one query, however deep the branch goes.
 */
async function collectSubtree(supabase: Supabase, kind: TreeKind, id: string) {
  if (kind === "content") {
    const { data: item } = await supabase
      .from("content_items")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();
    if (!item) return null;
    return { name: item.title, topicIds: [] as string[], itemIds: [item.id] };
  }

  let name: string;
  let topicIds: string[];

  if (kind === "subject") {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!subject) return null;

    const { data: topics } = await supabase
      .from("topics")
      .select("id")
      .eq("subject_id", id);

    name = subject.name;
    topicIds = (topics ?? []).map((t) => t.id);
  } else {
    const { data: topic } = await supabase
      .from("topics")
      .select("id, name, subject_id")
      .eq("id", id)
      .maybeSingle();
    if (!topic) return null;

    const { data: siblings } = await supabase
      .from("topics")
      .select("id, parent_topic_id")
      .eq("subject_id", topic.subject_id);

    const childrenOf = new Map<string, string[]>();
    for (const row of siblings ?? []) {
      if (!row.parent_topic_id) continue;
      const list = childrenOf.get(row.parent_topic_id) ?? [];
      list.push(row.id);
      childrenOf.set(row.parent_topic_id, list);
    }

    topicIds = [];
    const queue = [topic.id];
    while (queue.length > 0) {
      const next = queue.shift()!;
      topicIds.push(next);
      queue.push(...(childrenOf.get(next) ?? []));
    }
    name = topic.name;
  }

  let itemIds: string[] = [];
  if (topicIds.length > 0) {
    const { data: items } = await supabase
      .from("content_items")
      .select("id")
      .in("topic_id", topicIds);
    itemIds = (items ?? []).map((i) => i.id);
  }

  return { name, topicIds, itemIds };
}

export interface DeletionImpact {
  name: string;
  folders: number;
  lessons: number;
  files: number;
  videos: number;
  studentsWithProgress: number;
}

/**
 * What a delete would take with it, so the confirmation can say so in numbers
 * before anyone types a name. Folders count the node itself when it is one.
 */
export async function getDeletionImpact(kind: string, id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedKind = treeKindSchema.safeParse(kind);
    const parsedId = uuid("Item").safeParse(id);
    if (!parsedKind.success) return { error: firstIssue(parsedKind.error) };
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const subtree = await collectSubtree(supabase, parsedKind.data, parsedId.data);
    if (!subtree) return { error: "That no longer exists. Refresh the tree." };

    const { itemIds } = subtree;
    let files = 0;
    let videos = 0;
    let studentsWithProgress = 0;

    if (itemIds.length > 0) {
      const [fileCount, videoCount, progress] = await Promise.all([
        supabase
          .from("content_files")
          .select("id", { count: "exact", head: true })
          .in("content_item_id", itemIds),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .in("id", itemIds)
          .not("bunny_video_guid", "is", null),
        supabase
          .from("student_progress")
          .select("student_id")
          .in("content_item_id", itemIds),
      ]);
      files = fileCount.count ?? 0;
      videos = videoCount.count ?? 0;
      studentsWithProgress = new Set(
        (progress.data ?? []).map((row) => row.student_id)
      ).size;
    }

    const impact: DeletionImpact = {
      name: subtree.name,
      folders: subtree.topicIds.length,
      lessons: itemIds.length,
      files,
      videos,
      studentsWithProgress,
    };
    return { data: impact };
  } catch (err) {
    console.error("getDeletionImpact failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Deletes a subject, a folder or a lesson, and everything beneath it.
 *
 * Super admin only. The database already restricts deleting a lesson to the
 * super admin, and a folder delete cascades through lessons by foreign key --
 * which runs beneath RLS -- so allowing a content creator here would let them
 * do by the folder what they cannot do by the lesson.
 *
 * Anything that contains something has to be confirmed by typing its name,
 * and the name is checked here as well as in the dialog.
 *
 * The rows go first and the stored objects after. If the delete fails nothing
 * else is touched; if a cleanup step fails the lesson is already gone and the
 * leftover file or video is logged rather than resurrecting the lesson. That
 * cleanup is the part the old per-lesson delete never did: every lesson it
 * removed left its PDFs in the bucket and its video billed on Bunny.
 */
export async function deleteTreeNode(kind: string, id: string, confirmName?: string) {
  try {
    const { user } = await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedKind = treeKindSchema.safeParse(kind);
    const parsedId = uuid("Item").safeParse(id);
    if (!parsedKind.success) return { error: firstIssue(parsedKind.error) };
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };

    const nodeKind = parsedKind.data;
    const subtree = await collectSubtree(supabase, nodeKind, parsedId.data);
    if (!subtree) return { error: "That no longer exists. Refresh the tree." };

    const holdsSomething =
      nodeKind !== "content" &&
      (subtree.itemIds.length > 0 || subtree.topicIds.length > (nodeKind === "topic" ? 1 : 0));

    if (holdsSomething && (confirmName ?? "").trim() !== subtree.name.trim()) {
      return { error: "Type the exact name to confirm." };
    }

    // Read what has to be cleaned up before the rows that point at it go.
    let storagePaths: string[] = [];
    let videoGuids: string[] = [];

    if (subtree.itemIds.length > 0) {
      const [{ data: files }, { data: items }] = await Promise.all([
        supabase
          .from("content_files")
          .select("storage_path")
          .in("content_item_id", subtree.itemIds),
        supabase
          .from("content_items")
          .select("id, bunny_video_guid, metadata")
          .in("id", subtree.itemIds),
      ]);

      storagePaths = (files ?? []).map((f) => f.storage_path);
      for (const item of items ?? []) {
        if (item.bunny_video_guid) videoGuids.push(item.bunny_video_guid);
        const pending = (item.metadata as Record<string, unknown> | null)?.pending_video_guid;
        if (typeof pending === "string" && pending) videoGuids.push(pending);
      }
      videoGuids = Array.from(new Set(videoGuids));
    }

    const table =
      nodeKind === "subject" ? "subjects" : nodeKind === "topic" ? "topics" : "content_items";

    const { data: deleted, error } = await supabase
      .from(table)
      .delete()
      .eq("id", parsedId.data)
      .select("id");

    if (error) {
      console.error("deleteTreeNode failed:", error);
      return { error: "Something went wrong. Nothing was deleted." };
    }
    if (!deleted || deleted.length === 0) {
      // RLS answered with zero rows rather than an error.
      return { error: "You do not have permission to delete this." };
    }

    let cleanupFailures = 0;

    for (let i = 0; i < storagePaths.length; i += 100) {
      const { error: removeError } = await supabase.storage
        .from(FILES_BUCKET)
        .remove(storagePaths.slice(i, i + 100));
      if (removeError) {
        cleanupFailures += 1;
        console.error("deleteTreeNode: file cleanup failed", removeError);
      }
    }

    const posterPaths = subtree.itemIds.flatMap((itemId) =>
      POSTER_EXTENSIONS.map((ext) => `lessons/${itemId}/poster.${ext}`)
    );
    for (let i = 0; i < posterPaths.length; i += 100) {
      const { error: posterError } = await supabase.storage
        .from(POSTER_BUCKET)
        .remove(posterPaths.slice(i, i + 100));
      if (posterError) {
        cleanupFailures += 1;
        console.error("deleteTreeNode: poster cleanup failed", posterError);
      }
    }

    if (videoGuids.length > 0 && isBunnyConfigured()) {
      const results = await Promise.allSettled(videoGuids.map((guid) => deleteVideo(guid)));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          cleanupFailures += 1;
          console.error(
            `deleteTreeNode: Bunny video ${videoGuids[index]} was not deleted`,
            result.reason
          );
        }
      });
    }

    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "content_deleted",
      entity_type: nodeKind === "content" ? "content_item" : nodeKind,
      entity_id: parsedId.data,
      old_data: {
        name: subtree.name,
        folders: subtree.topicIds.length,
        lessons: subtree.itemIds.length,
        files: storagePaths.length,
        videos: videoGuids.length,
      },
      metadata: { cleanup_failures: cleanupFailures },
    });

    revalidatePath("/admin/content/manager");
    return {
      data: {
        lessons: subtree.itemIds.length,
        folders: subtree.topicIds.length,
        cleanupFailures,
      },
    };
  } catch (err) {
    console.error("deleteTreeNode failed:", err);
    return { error: describeFailure(err) };
  }
}

/** The course a subject, folder or lesson belongs to. */
async function courseOf(supabase: Supabase, kind: "subject" | "topic" | "content", id: string) {
  if (kind === "subject") {
    const { data } = await supabase.from("subjects").select("course_id").eq("id", id).maybeSingle();
    return data?.course_id ?? null;
  }
  let subjectId: string | null = null;
  if (kind === "topic") {
    const { data } = await supabase.from("topics").select("subject_id").eq("id", id).maybeSingle();
    subjectId = data?.subject_id ?? null;
  } else {
    const { data } = await supabase
      .from("content_items")
      .select("topic_id, topics(subject_id)")
      .eq("id", id)
      .maybeSingle();
    subjectId = (data?.topics as { subject_id: string } | null)?.subject_id ?? null;
  }
  if (!subjectId) return null;
  return courseOf(supabase, "subject", subjectId);
}

/** Next weight at the end of a folder or subject's direct children. */
async function nextWeight(
  supabase: Supabase,
  table: "topics" | "content_items",
  parent: { kind: "subject" | "topic"; id: string }
) {
  let top: number | undefined;

  if (table === "content_items") {
    const { data } = await supabase
      .from("content_items")
      .select("weight")
      .eq("topic_id", parent.id)
      .order("weight", { ascending: false })
      .limit(1);
    top = data?.[0]?.weight;
  } else {
    let query = supabase
      .from("topics")
      .select("weight")
      .order("weight", { ascending: false })
      .limit(1);
    query =
      parent.kind === "subject"
        ? query.eq("subject_id", parent.id).is("parent_topic_id", null)
        : query.eq("parent_topic_id", parent.id);
    const { data } = await query;
    top = data?.[0]?.weight;
  }

  return (top ?? 0) + 1;
}

/**
 * Moves a folder (with everything in it) or a single lesson.
 *
 * A folder can go under a subject or inside another folder; the database
 * refuses a move into its own subfolder and re-derives the subject for the
 * whole branch. A lesson can only go into a folder. Neither may leave its
 * course: that would move lessons across a paywall, which the folder trigger
 * refuses on its own and this checks for lessons, which have no trigger.
 */
export async function moveTreeNode(kind: string, id: string, target: unknown) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedKind = treeKindSchema.safeParse(kind);
    const parsedId = uuid("Item").safeParse(id);
    const parsedTarget = moveTargetSchema.safeParse(target);
    if (!parsedKind.success) return { error: firstIssue(parsedKind.error) };
    if (!parsedId.success) return { error: firstIssue(parsedId.error) };
    if (!parsedTarget.success) return { error: firstIssue(parsedTarget.error) };

    const nodeKind = parsedKind.data;
    const dest = parsedTarget.data;

    if (nodeKind === "subject") {
      return { error: "A subject is already at the top of the course." };
    }
    if (nodeKind === "content" && dest.kind !== "topic") {
      return { error: "Lessons go inside a folder, not directly under a subject." };
    }
    if (nodeKind === "topic" && dest.kind === "topic" && dest.id === parsedId.data) {
      return { error: "A folder cannot be moved into itself." };
    }

    const [fromCourse, toCourse] = await Promise.all([
      courseOf(supabase, nodeKind, parsedId.data),
      courseOf(supabase, dest.kind, dest.id),
    ]);
    if (!fromCourse || !toCourse) {
      return { error: "That no longer exists. Refresh the tree." };
    }
    if (fromCourse !== toCourse) {
      return { error: "Items can only be moved within the same course." };
    }

    if (nodeKind === "content") {
      const weight = await nextWeight(supabase, "content_items", dest);
      const { data, error } = await supabase
        .from("content_items")
        .update({ topic_id: dest.id, weight })
        .eq("id", parsedId.data)
        .select()
        .single();
      if (error) {
        console.error("moveTreeNode failed:", error);
        return { error: "Could not move that lesson. Please try again." };
      }
      revalidatePath("/admin/content/manager");
      return { data };
    }

    const weight = await nextWeight(supabase, "topics", dest);
    const update =
      dest.kind === "subject"
        ? { parent_topic_id: null, subject_id: dest.id, weight }
        : { parent_topic_id: dest.id, weight };

    const { data, error } = await supabase
      .from("topics")
      .update(update)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      // The tree trigger words its own refusals for people; pass those on.
      if (error.code === "23514" || error.code === "23503") {
        return { error: error.message };
      }
      console.error("moveTreeNode failed:", error);
      return { error: "Could not move that folder. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("moveTreeNode failed:", err);
    return { error: describeFailure(err) };
  }
}
