"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import type { Database } from "@/types/supabase";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";
import {
  contentItemCreateSchema,
  contentItemUpdateSchema,
  reorderSchema,
  subjectCreateSchema,
  subjectUpdateSchema,
  topicCreateSchema,
  topicUpdateSchema,
} from "@/lib/validations/content";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}


// ─── Subject ───

export async function createSubject(courseId: string, name: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = subjectCreateSchema.safeParse({ course_id: courseId, name });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { count } = await supabase
      .from("subjects")
      .select("id", { count: "exact", head: true })
      .eq("course_id", parsed.data.course_id);

    const { data, error } = await supabase
      .from("subjects")
      .insert({
        course_id: parsed.data.course_id,
        name: parsed.data.name,
        slug: toSlug(parsed.data.name),
        weight: (count ?? 0) + 1,
        color_code: "#6366f1",
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
      console.error("createSubject failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("createSubject failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateSubject(
  id: string,
  fields: { name?: string; color_code?: string; is_visible?: boolean }
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Subject").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = subjectUpdateSchema.safeParse(fields);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const update: Database["public"]["Tables"]["subjects"]["Update"] = {};
    if (parsed.data.name !== undefined) {
      update.name = parsed.data.name;
      update.slug = toSlug(parsed.data.name);
    }
    if (parsed.data.color_code !== undefined) update.color_code = parsed.data.color_code;
    if (parsed.data.is_visible !== undefined) update.is_visible = parsed.data.is_visible;

    const { data, error } = await supabase
      .from("subjects")
      .update(update)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      console.error("updateSubject failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("updateSubject failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Topic ───

/**
 * Creates a folder directly under a subject, or inside another folder.
 *
 * The weight counts only the new folder's own siblings, so a folder added
 * three levels down lands at the end of that level rather than after every
 * folder in the subject.
 */
export async function createTopic(
  subjectId: string,
  name: string,
  parentTopicId: string | null = null
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = topicCreateSchema.safeParse({
      subject_id: subjectId,
      parent_topic_id: parentTopicId,
      name,
    });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    let siblings = supabase
      .from("topics")
      .select("id", { count: "exact", head: true });
    siblings = parsed.data.parent_topic_id
      ? siblings.eq("parent_topic_id", parsed.data.parent_topic_id)
      : siblings.eq("subject_id", parsed.data.subject_id).is("parent_topic_id", null);
    const { count } = await siblings;

    const { data, error } = await supabase
      .from("topics")
      .insert({
        subject_id: parsed.data.subject_id,
        parent_topic_id: parsed.data.parent_topic_id ?? null,
        name: parsed.data.name,
        slug: toSlug(parsed.data.name),
        weight: (count ?? 0) + 1,
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23514" || error.code === "23503") {
        return { error: error.message };
      }
      console.error("createTopic failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("createTopic failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateTopic(
  id: string,
  fields: { name?: string; is_visible?: boolean; description?: string }
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Topic").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = topicUpdateSchema.safeParse(fields);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const update: Database["public"]["Tables"]["topics"]["Update"] = {};
    if (parsed.data.name !== undefined) {
      update.name = parsed.data.name;
      update.slug = toSlug(parsed.data.name);
    }
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.is_visible !== undefined) update.is_visible = parsed.data.is_visible;

    const { data, error } = await supabase
      .from("topics")
      .update(update)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      console.error("updateTopic failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("updateTopic failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Content Item ───

export async function createContentItem(
  topicId: string,
  title: string,
  type: string
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = contentItemCreateSchema.safeParse({
      topic_id: topicId,
      title,
      type,
    });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", parsed.data.topic_id);

    const { data, error } = await supabase
      .from("content_items")
      .insert({
        topic_id: parsed.data.topic_id,
        title: parsed.data.title,
        type: parsed.data.type,
        weight: (count ?? 0) + 1,
        is_paid: true,
        is_downloadable: false,
        is_printable: false,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("createContentItem failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("createContentItem failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateContentItem(
  id: string,
  fields: Record<string, unknown>
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Content item").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = contentItemUpdateSchema.safeParse(fields);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const update: Database["public"]["Tables"]["content_items"]["Update"] = {};
    if (parsed.data.title !== undefined) update.title = parsed.data.title;
    if (parsed.data.type !== undefined) update.type = parsed.data.type;
    if (parsed.data.status !== undefined) update.status = parsed.data.status;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.file_url !== undefined) update.file_url = parsed.data.file_url;
    if (parsed.data.video_id !== undefined) update.video_id = parsed.data.video_id;
    if (parsed.data.is_paid !== undefined) update.is_paid = parsed.data.is_paid;
    if (parsed.data.is_downloadable !== undefined) {
      update.is_downloadable = parsed.data.is_downloadable;
    }
    if (parsed.data.is_printable !== undefined) update.is_printable = parsed.data.is_printable;
    if (parsed.data.play_limit !== undefined) update.play_limit = parsed.data.play_limit;
    if (parsed.data.duration_seconds !== undefined) {
      update.duration_seconds = parsed.data.duration_seconds;
    }
    if (parsed.data.offline_license_days !== undefined) {
      update.offline_license_days = parsed.data.offline_license_days;
    }
    if (parsed.data.publish_at !== undefined) update.publish_at = parsed.data.publish_at;
    if (parsed.data.weight !== undefined) update.weight = parsed.data.weight;

    // Publishing by hand retires the date. Leaving it set would show a live
    // lesson as "scheduled" forever, and the job would never clear it because
    // it only looks at drafts.
    if (update.status === "published") update.publish_at = null;

    const { data, error } = await supabase
      .from("content_items")
      .update(update)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      console.error("updateContentItem failed:", error);

      // The poster gate lives in a database trigger, because the cron job
      // publishes without going through here. Its message is written for an
      // admin to read, so it is passed along rather than flattened into
      // "something went wrong" -- which would leave them changing the status
      // again and again with no idea what is refusing it.
      if (error.code === "23514" && /poster/i.test(error.message)) {
        return {
          error:
            "This video needs a poster image before it can be published. "
            + "Add one in the Video panel, then publish.",
        };
      }

      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("updateContentItem failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Offline ───

/**
 * Turns the offline switch on for every content item under a subject or folder,
 * at any depth.
 *
 * A Maths course is sixty-odd items, and a mentor who has decided the course
 * should work on a phone with no signal should not have to click sixty
 * switches to say so. The update is scoped by walking down from the node, so
 * passing a topic id can only ever reach that topic's own items.
 *
 * Quizzes are skipped. Tests are online-only -- they are scored server-side
 * and a downloaded one could be re-attempted offline with no record of it --
 * so marking them downloadable would promise something the app cannot do.
 */
export async function enableOfflineForSubtree(
  kind: "subject" | "topic",
  nodeId: string
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid(kind === "subject" ? "Subject" : "Topic").safeParse(
      nodeId
    );
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    let topicIds: string[] = [parsedId.data];

    if (kind === "subject") {
      const { data: topics, error: topicError } = await supabase
        .from("topics")
        .select("id")
        .eq("subject_id", parsedId.data);

      if (topicError) {
        console.error("enableOfflineForSubtree failed:", topicError);
        return { error: "Something went wrong. Please try again." };
      }
      topicIds = (topics ?? []).map((topic) => topic.id);
    } else {
      // A folder's branch: every folder below it, at any depth. Walked in
      // memory from the subject's folders rather than one query per level.
      const { data: self } = await supabase
        .from("topics")
        .select("subject_id")
        .eq("id", parsedId.data)
        .maybeSingle();

      if (self) {
        const { data: branch } = await supabase
          .from("topics")
          .select("id, parent_topic_id")
          .eq("subject_id", self.subject_id);

        const childrenOf = new Map<string, string[]>();
        for (const row of branch ?? []) {
          if (!row.parent_topic_id) continue;
          childrenOf.set(row.parent_topic_id, [
            ...(childrenOf.get(row.parent_topic_id) ?? []),
            row.id,
          ]);
        }
        topicIds = [];
        const queue = [parsedId.data];
        while (queue.length > 0) {
          const next = queue.shift()!;
          topicIds.push(next);
          queue.push(...(childrenOf.get(next) ?? []));
        }
      }
    }

    if (topicIds.length === 0) return { data: { updated: 0 } };

    const { data, error } = await supabase
      .from("content_items")
      .update({ is_downloadable: true })
      .in("topic_id", topicIds)
      .neq("type", "quiz")
      .eq("is_downloadable", false)
      .select("id");

    if (error) {
      console.error("enableOfflineForSubtree failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { data: { updated: (data ?? []).length } };
  } catch (err) {
    console.error("enableOfflineForSubtree failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Reorder ───

export async function reorderItems(
  table: string,
  orderedIds: string[]
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);

    const parsed = reorderSchema.safeParse({ table, orderedIds });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const supabase = await createClient();
    const safeTable = parsed.data.table;

    const updates = parsed.data.orderedIds.map((id, index) =>
      supabase.from(safeTable).update({ weight: index + 1 }).eq("id", id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed?.error) {
      console.error("reorderItems failed:", failed.error);
      return { error: "Something went wrong. Please try again." };
    }
    return { success: true };
  } catch (err) {
    console.error("reorderItems failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Fetch tree ───

export async function fetchCourseTree(courseId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator", "teacher"]);
    const supabase = await createClient();

    const parsedId = uuid("Course").safeParse(courseId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: subjects, error: sErr } = await supabase
      .from("subjects")
      .select("*")
      .eq("course_id", parsedId.data)
      .order("weight");

    if (sErr) {
      console.error("fetchCourseTree failed:", sErr);
      return { error: "Something went wrong. Please try again." };
    }
    if (!subjects || subjects.length === 0) return { data: [] };

    const subjectIds = subjects.map((s) => s.id);

    const { data: topics, error: tErr } = await supabase
      .from("topics")
      .select("*")
      .in("subject_id", subjectIds)
      .order("weight");

    if (tErr) {
      console.error("fetchCourseTree failed:", tErr);
      return { error: "Something went wrong. Please try again." };
    }

    const topicIds = (topics || []).map((t) => t.id);

    let contentItems: Record<string, unknown>[] = [];
    if (topicIds.length > 0) {
      const { data: items, error: cErr } = await supabase
        .from("content_items")
        .select("*")
        .in("topic_id", topicIds)
        .order("weight");

      if (cErr) {
        console.error("fetchCourseTree failed:", cErr);
        return { error: "Something went wrong. Please try again." };
      }
      contentItems = items || [];
    }

    const contentMap = new Map<string, typeof contentItems>();
    for (const item of contentItems) {
      const tId = item.topic_id as string;
      if (!contentMap.has(tId)) contentMap.set(tId, []);
      contentMap.get(tId)!.push(item);
    }

    // Folders hang off their parent folder, or off the subject when they have
    // none. Built as a lookup first so a folder at any depth is placed in one
    // pass, whatever order the rows arrived in.
    type TopicRow = NonNullable<typeof topics>[number];
    const rootFolders = new Map<string, TopicRow[]>();
    const childFolders = new Map<string, TopicRow[]>();
    for (const topic of topics || []) {
      const bucket = topic.parent_topic_id ? childFolders : rootFolders;
      const key = topic.parent_topic_id ?? topic.subject_id;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(topic);
    }

    function lessonNode(item: Record<string, unknown>) {
      return {
        id: item.id as string,
        kind: "content" as const,
        name: item.title as string,
        weight: item.weight as number,
        status: item.status as string,
        contentType: item.type as string,
        children: [],
        data: item,
      };
    }

    function folderNode(topic: TopicRow, seen: Set<string>): unknown {
      // The trigger refuses cycles; this only stops a corrupt row from
      // hanging the panel if one ever got past it.
      if (seen.has(topic.id)) return null;
      seen.add(topic.id);
      const folders = (childFolders.get(topic.id) || [])
        .map((child) => folderNode(child, seen))
        .filter(Boolean);
      const lessons = (contentMap.get(topic.id) || []).map(lessonNode);
      return {
        id: topic.id,
        kind: "topic" as const,
        name: topic.name,
        weight: topic.weight,
        // Subfolders before lessons, the way a file browser lists them.
        children: [...folders, ...lessons],
        data: topic,
      };
    }

    const seen = new Set<string>();
    const tree = subjects.map((subject) => ({
      id: subject.id,
      kind: "subject" as const,
      name: subject.name,
      weight: subject.weight,
      children: (rootFolders.get(subject.id) || [])
        .map((topic) => folderNode(topic, seen))
        .filter(Boolean),
      data: subject,
    }));

    return { data: tree };
  } catch (err) {
    console.error("fetchCourseTree failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Bulk create, for the uploader ───

/**
 * Creates one draft content item per file in a batch.
 *
 * Separate from `createContentItem` because the weights have to be contiguous
 * across the whole batch: calling the single version in a loop would read the
 * same count every time on a fast connection and land twenty lessons on the
 * same weight, leaving the tree in an order nobody chose.
 *
 * Everything lands as a draft. Thirty lessons appearing live the moment their
 * files finish uploading is not something anyone would ask for.
 */
export async function bulkCreateContentItems(
  topicId: string,
  entries: { title: string; type: string }[]
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    if (!Array.isArray(entries) || entries.length === 0) {
      return { error: "No files to add." };
    }
    if (entries.length > 50) {
      return { error: "Add at most 50 files at a time." };
    }

    const parsedEntries = [];
    for (const entry of entries) {
      const parsed = contentItemCreateSchema.safeParse({
        topic_id: topicId,
        title: entry.title,
        type: entry.type,
      });
      if (!parsed.success) {
        return { error: firstIssue(parsed.error) };
      }
      parsedEntries.push(parsed.data);
    }

    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", parsedEntries[0].topic_id);

    const base = count ?? 0;

    const { data, error } = await supabase
      .from("content_items")
      .insert(
        parsedEntries.map((entry, index) => ({
          topic_id: entry.topic_id,
          title: entry.title,
          type: entry.type,
          weight: base + index,
        }))
      )
      .select();

    if (error) {
      console.error("bulkCreateContentItems failed:", error);
      return { error: "Could not create the lessons. Please try again." };
    }

    // Returned in the order they were asked for, not the order Postgres chose,
    // so the caller can pair each row with the file it came from.
    const byTitle = new Map((data ?? []).map((row) => [row.id, row]));
    const ordered = (data ?? [])
      .slice()
      .sort((a, b) => a.weight - b.weight)
      .map((row) => byTitle.get(row.id)!);

    revalidatePath("/admin/content/manager");
    return { data: ordered };
  } catch (err) {
    console.error("bulkCreateContentItems failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Scheduled publishing ───

export interface SchedulerHealth {
  job_exists: boolean;
  schedule: string | null;
  last_run_at: string | null;
  last_status: string | null;
  overdue: number;
  next_due_at: string | null;
  /**
   * Overdue video lessons the publish gate is holding back for want of a
   * poster. Counted separately because "three lessons are late" and "three
   * lessons are late and will stay late until you add a poster" are different
   * problems, and only one of them is the scheduler's fault.
   */
  blocked_no_poster: number;
}

/**
 * Whether the publishing job is actually running.
 *
 * Surfaced in the panel rather than left to trust: a cron job that stops
 * firing does so silently, and the first sign would otherwise be a lesson that
 * never went live.
 */
export async function getSchedulerHealth() {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    // Two calls because the blocked count could not be added as a column on
    // the health function: widening a RETURNS TABLE is a return-type change,
    // and `create or replace` cannot do that.
    const [health, blocked] = await Promise.all([
      supabase.rpc("scheduled_publish_health"),
      supabase.rpc("scheduled_publish_blocked"),
    ]);

    if (health.error) {
      console.error("getSchedulerHealth failed:", health.error);
      return { error: "Could not read the scheduler status." };
    }

    const row = Array.isArray(health.data) ? health.data[0] : null;
    if (!row) return { error: "Could not read the scheduler status." };

    if (blocked.error) {
      console.error("getSchedulerHealth: blocked count failed:", blocked.error);
    }

    return {
      data: {
        ...(row as unknown as Omit<SchedulerHealth, "blocked_no_poster">),
        blocked_no_poster: Number(blocked.data) || 0,
      } satisfies SchedulerHealth,
    };
  } catch (err) {
    console.error("getSchedulerHealth failed:", err);
    return { error: describeFailure(err) };
  }
}

/** Runs the publishing pass now, for anything already due. */
export async function publishDueNow() {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("publish_due_content");

    if (error) {
      console.error("publishDueNow failed:", error);
      return { error: "Could not publish the due lessons." };
    }

    revalidatePath("/admin/content/manager");
    return { data: { published: Number(data) || 0 } };
  } catch (err) {
    console.error("publishDueNow failed:", err);
    return { error: describeFailure(err) };
  }
}
