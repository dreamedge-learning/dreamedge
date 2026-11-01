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

export async function deleteSubject(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Subject").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { count } = await supabase
      .from("topics")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", parsedId.data);

    if (count && count > 0) {
      return { error: `Cannot delete: ${count} topic${count > 1 ? "s" : ""} exist under this subject` };
    }

    const { error } = await supabase.from("subjects").delete().eq("id", parsedId.data);
    if (error) {
      console.error("deleteSubject failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { success: true };
  } catch (err) {
    console.error("deleteSubject failed:", err);
    return { error: describeFailure(err) };
  }
}

// ─── Topic ───

export async function createTopic(subjectId: string, name: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = topicCreateSchema.safeParse({ subject_id: subjectId, name });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { count } = await supabase
      .from("topics")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", parsed.data.subject_id);

    const { data, error } = await supabase
      .from("topics")
      .insert({
        subject_id: parsed.data.subject_id,
        name: parsed.data.name,
        slug: toSlug(parsed.data.name),
        weight: (count ?? 0) + 1,
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
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

export async function deleteTopic(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Topic").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", parsedId.data);

    if (count && count > 0) {
      return { error: `Cannot delete: ${count} content item${count > 1 ? "s" : ""} exist under this topic` };
    }

    const { error } = await supabase.from("topics").delete().eq("id", parsedId.data);
    if (error) {
      console.error("deleteTopic failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { success: true };
  } catch (err) {
    console.error("deleteTopic failed:", err);
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
    if (parsed.data.weight !== undefined) update.weight = parsed.data.weight;

    const { data, error } = await supabase
      .from("content_items")
      .update(update)
      .eq("id", parsedId.data)
      .select()
      .single();

    if (error) {
      console.error("updateContentItem failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("updateContentItem failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteContentItem(id: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Content item").safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("content_items")
      .delete()
      .eq("id", parsedId.data);
    if (error) {
      console.error("deleteContentItem failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    revalidatePath("/admin/content/manager");
    return { success: true };
  } catch (err) {
    console.error("deleteContentItem failed:", err);
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

// ─── Upload ───

export async function uploadContentFile(
  contentId: string,
  formData: FormData
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsedId = uuid("Content item").safeParse(contentId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No file provided" };
    }
    if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50MB" };

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `content/${parsedId.data}/file.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-files")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error("uploadContentFile failed:", uploadError);
      return { error: "Something went wrong. Please try again." };
    }

    // `content-files` is private. Storing the object path rather than a URL
    // keeps the file reachable only through /api/content/[id]/file, which
    // checks enrolment before signing.
    const { error: updateError } = await supabase
      .from("content_items")
      .update({ file_url: path })
      .eq("id", parsedId.data);

    if (updateError) {
      console.error("uploadContentFile failed:", updateError);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/content/manager");
    return { success: true, path };
  } catch (err) {
    console.error("uploadContentFile failed:", err);
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

    const topicMap = new Map<string, typeof topics>();
    for (const topic of topics || []) {
      const subId = topic.subject_id as string;
      if (!topicMap.has(subId)) topicMap.set(subId, []);
      topicMap.get(subId)!.push(topic);
    }

    const contentMap = new Map<string, typeof contentItems>();
    for (const item of contentItems) {
      const tId = item.topic_id as string;
      if (!contentMap.has(tId)) contentMap.set(tId, []);
      contentMap.get(tId)!.push(item);
    }

    const tree = subjects.map((subject) => ({
      id: subject.id,
      kind: "subject" as const,
      name: subject.name,
      weight: subject.weight,
      children: (topicMap.get(subject.id) || []).map((topic) => ({
        id: topic.id,
        kind: "topic" as const,
        name: topic.name,
        weight: topic.weight,
        children: (contentMap.get(topic.id) || []).map((item) => ({
          id: item.id as string,
          kind: "content" as const,
          name: item.title as string,
          weight: item.weight as number,
          status: item.status as string,
          contentType: item.type as string,
          children: [],
          data: item,
        })),
        data: topic,
      })),
      data: subject,
    }));

    return { data: tree };
  } catch (err) {
    console.error("fetchCourseTree failed:", err);
    return { error: describeFailure(err) };
  }
}
