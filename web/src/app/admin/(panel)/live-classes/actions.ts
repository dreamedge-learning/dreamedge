"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAdmin, type AdminRole } from "@/lib/auth-guard";
import type { Json } from "@/types/supabase";

const scheduleSchema = z.object({
  course_id: z.string().uuid("Pick a course"),
  teacher_id: z.string().uuid("Pick a teacher").nullable().optional(),
  title: z.string().min(3, "Title too short").max(200),
  description: z.string().max(2000).optional().default(""),
  scheduled_at: z.string().min(1, "Pick a date & time"),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  platform: z.enum(["in_app", "zoom", "google_meet", "youtube"]).default("in_app"),
  meeting_url: z.string().url().optional().or(z.literal("")),
});

export type ScheduleValues = z.infer<typeof scheduleSchema>;

export interface LiveClassRow {
  id: string;
  title: string;
  description: string | null;
  course_id: string;
  teacher_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  platform: string | null;
  meeting_url: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  recording_url: string | null;
  rewatch_content_id: string | null;
  attendee_count: number;
  course: { id: string; title: string; slug: string } | null;
  teacher: { id: string; full_name: string } | null;
}

/** Roles permitted to author or delete scheduled classes. */
const SCHEDULERS: AdminRole[] = ["super_admin", "content_creator"];
/** Roles permitted to move a class between states (teachers go live). */
const BROADCASTERS: AdminRole[] = ["super_admin", "content_creator", "teacher"];

type Guard = Awaited<ReturnType<typeof assertAdmin>>;

/**
 * Every exported action below funnels through this. The previous
 * implementation selected a non-existent `admin_users.role` column, so
 * PostgREST errored, `maybeSingle()` returned null, and the guard reported
 * "Not an admin" to every caller including super_admin -- which silently
 * disabled the entire live-class workflow. It also left the four read actions
 * completely ungated while they queried through the service-role client.
 */
async function guardOrNull(roles?: AdminRole[]): Promise<Guard | null> {
  try {
    return await assertAdmin(roles);
  } catch {
    return null;
  }
}

async function writeAudit(
  guard: Guard,
  action: string,
  entityId: string,
  data: Record<string, unknown>
) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      user_id: guard.adminUser.user_id,
      action,
      entity_type: "live_class",
      entity_id: entityId,
      // audit_log.new_data is jsonb; the payloads below are plain
      // string/number/null records, which Json models structurally.
      new_data: data as unknown as Json,
    });
  } catch {
    // Audit must never block the operation it records.
  }
}

export async function listLiveClasses(
  filter: "scheduled" | "live" | "pending_recording" | "rewatch_library"
) {
  const guard = await guardOrNull();
  if (!guard) return [];

  const supabase = createServiceClient();
  let query = supabase
    .from("live_classes")
    .select(
      `id, title, description, course_id, teacher_id, scheduled_at,
       duration_minutes, platform, meeting_url, status, recording_url,
       rewatch_content_id, attendee_count,
       course:courses(id, title, slug),
       teacher:admin_users(id, full_name)`
    );

  if (filter === "scheduled") {
    query = query.in("status", ["scheduled"]).order("scheduled_at", { ascending: true });
  } else if (filter === "live") {
    query = query.eq("status", "live").order("scheduled_at", { ascending: false });
  } else if (filter === "pending_recording") {
    query = query
      .eq("status", "ended")
      .is("rewatch_content_id", null)
      .order("scheduled_at", { ascending: false });
  } else if (filter === "rewatch_library") {
    query = query
      .eq("status", "ended")
      .not("rewatch_content_id", "is", null)
      .order("scheduled_at", { ascending: false });
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as LiveClassRow[];
  const mapped = rows.map((r) => ({
    ...r,
    course: Array.isArray(r.course) ? r.course[0] ?? null : r.course,
    teacher: Array.isArray(r.teacher) ? r.teacher[0] ?? null : r.teacher,
  }));

  // A teacher only ever sees the classes assigned to them.
  if (guard.adminUser.role_name === "teacher") {
    return mapped.filter((r) => r.teacher_id === guard.adminUser.id);
  }
  return mapped;
}

export async function listTeachers() {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return [];

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id, full_name, is_active, role:roles(name)")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  type Row = {
    id: string;
    full_name: string;
    is_active: boolean | null;
    role: { name: string } | { name: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const teachable = new Set(["teacher", "content_creator", "super_admin"]);
  return rows
    .map((r) => {
      const roleObj = Array.isArray(r.role) ? r.role[0] : r.role;
      return { id: r.id, full_name: r.full_name, role: roleObj?.name ?? "" };
    })
    .filter((r) => teachable.has(r.role));
}

export async function listCoursesForSchedule() {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return [];

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, slug")
    .order("title", { ascending: true });
  return (data ?? []) as { id: string; title: string; slug: string }[];
}

export async function scheduleLiveClass(formData: FormData) {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return { ok: false, error: "You don't have permission to schedule classes." };

  const parsed = scheduleSchema.safeParse({
    course_id: formData.get("course_id"),
    teacher_id: formData.get("teacher_id") || null,
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    scheduled_at: formData.get("scheduled_at"),
    duration_minutes: formData.get("duration_minutes"),
    platform: formData.get("platform") ?? "in_app",
    meeting_url: formData.get("meeting_url") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "That date & time could not be read." };
  }

  const service = createServiceClient();
  const payload = {
    course_id: parsed.data.course_id,
    teacher_id: parsed.data.teacher_id || null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    scheduled_at: scheduledAt.toISOString(),
    duration_minutes: parsed.data.duration_minutes,
    platform: parsed.data.platform,
    meeting_url: parsed.data.meeting_url || null,
    status: "scheduled" as const,
  };

  const { data, error } = await service
    .from("live_classes")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeAudit(guard, "create", data.id, payload);
  revalidatePath("/admin/live-classes");
  return { ok: true, id: data.id };
}

export async function transitionLiveClass(
  id: string,
  nextStatus: "live" | "ended" | "cancelled",
  options?: { meeting_url?: string | null; recording_url?: string | null }
) {
  const guard = await guardOrNull(BROADCASTERS);
  if (!guard) return { ok: false, error: "You don't have permission to change this class." };

  const service = createServiceClient();

  // A teacher may only act on a class assigned to them, and may never cancel.
  if (guard.adminUser.role_name === "teacher") {
    if (nextStatus === "cancelled") {
      return { ok: false, error: "Only an admin can cancel a class." };
    }
    const { data: owned } = await service
      .from("live_classes")
      .select("teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (!owned || owned.teacher_id !== guard.adminUser.id) {
      return { ok: false, error: "That class is not assigned to you." };
    }
  }

  const patch: {
    status: "live" | "ended" | "cancelled";
    meeting_url?: string | null;
    recording_url?: string | null;
  } = { status: nextStatus };
  if (options?.meeting_url !== undefined) patch.meeting_url = options.meeting_url;
  if (options?.recording_url !== undefined) patch.recording_url = options.recording_url;

  const { error } = await service.from("live_classes").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await writeAudit(guard, "transition", id, patch);
  revalidatePath("/admin/live-classes");
  return { ok: true };
}

export async function attachRewatchContent(id: string, contentItemId: string) {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return { ok: false, error: "You don't have permission to link recordings." };
  if (!contentItemId) return { ok: false, error: "Pick a content item to link" };

  const service = createServiceClient();
  const { error } = await service
    .from("live_classes")
    .update({ rewatch_content_id: contentItemId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await writeAudit(guard, "attach_rewatch", id, { rewatch_content_id: contentItemId });
  revalidatePath("/admin/live-classes");
  return { ok: true };
}

export async function detachRewatchContent(id: string) {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return { ok: false, error: "You don't have permission to unlink recordings." };

  const service = createServiceClient();
  const { error } = await service
    .from("live_classes")
    .update({ rewatch_content_id: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await writeAudit(guard, "detach_rewatch", id, { rewatch_content_id: null });
  revalidatePath("/admin/live-classes");
  return { ok: true };
}

export async function listRewatchableContentItems(courseId: string) {
  const guard = await guardOrNull(SCHEDULERS);
  if (!guard) return [];

  // Video content under this course that could be linked as a class rewatch.
  const service = createServiceClient();
  const { data: subjects } = await service
    .from("subjects")
    .select("id")
    .eq("course_id", courseId);
  const subjectIds = (subjects ?? []).map((s) => s.id);
  if (subjectIds.length === 0) return [];

  const { data: topics } = await service
    .from("topics")
    .select("id")
    .in("subject_id", subjectIds);
  const topicIds = (topics ?? []).map((t) => t.id);
  if (topicIds.length === 0) return [];

  const { data } = await service
    .from("content_items")
    .select("id, title, type, file_url, created_at")
    .in("topic_id", topicIds)
    .eq("type", "video")
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []) as {
    id: string;
    title: string;
    type: string;
    file_url: string | null;
    created_at: string;
  }[];
}
