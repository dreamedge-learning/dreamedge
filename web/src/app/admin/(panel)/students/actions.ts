"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import { sanitizeSearch } from "@/lib/search";
import { rangeEnd, rangeStart } from "@/lib/date-range";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import {
  bulkStudentStatusUpdateSchema,
  leadCreateInput,
  leadCreateSchema,
  leadIdSchema,
  leadListFilterSchema,
  leadUpdateSchema,
  studentIdSchema,
  studentListFilterSchema,
  studentStatusUpdateSchema,
  testimonialIdSchema,
  testimonialInput,
  testimonialOrderSchema,
  testimonialSchema,
} from "@/lib/validations/student";

interface StudentFilters {
  search?: string;
  status?: string;
  source?: string;
  city?: string;
  courseId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchStudents(filters: StudentFilters = {}) {
  try {
    await assertAdmin(["super_admin", "teacher", "support_staff"]);
    const supabase = await createClient();

    const parsedFilters = studentListFilterSchema.safeParse({
      status: filters.status,
      source: filters.source,
      courseId: filters.courseId,
      page: filters.page,
      pageSize: filters.pageSize,
    });

    if (!parsedFilters.success) {
      return { error: firstIssue(parsedFilters.error) };
    }

    const page = parsedFilters.data.page ?? 1;
    const pageSize = parsedFilters.data.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("students")
      .select(
        `id, full_name, email, phone, avatar_url, class, city, status, created_at,
         student_code, registration_source, profile_completed, enrollments(id)`,
        { count: "exact" }
      );

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe.length > 0) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
        );
      }
    }

    const statusFilter = parsedFilters.data.status;
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const sourceFilter = parsedFilters.data.source;
    if (sourceFilter && sourceFilter !== "all") {
      query = query.eq("registration_source", sourceFilter);
    }

    if (filters.city) {
      const safeCity = sanitizeSearch(filters.city);
      if (safeCity.length > 0) {
        query = query.ilike("city", `%${safeCity}%`);
      }
    }

    if (filters.dateFrom) {
      query = query.gte("created_at", rangeStart(filters.dateFrom));
    }

    if (filters.dateTo) {
      query = query.lte("created_at", rangeEnd(filters.dateTo));
    }

    const courseFilter = parsedFilters.data.courseId;
    if (courseFilter) {
      const { data: enrolled } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("course_id", courseFilter);

      const ids = enrolled?.map((e) => e.student_id) ?? [];
      if (ids.length === 0) {
        return { data: [], count: 0 };
      }
      query = query.in("id", ids);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("fetchStudents failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    const students = (data ?? []).map((s) => ({
      id: s.id,
      full_name: s.full_name,
      email: s.email,
      phone: s.phone,
      avatar_url: s.avatar_url,
      class: s.class,
      city: s.city,
      status: s.status,
      created_at: s.created_at,
      student_code: s.student_code,
      registration_source: s.registration_source,
      profile_completed: s.profile_completed,
      enrollment_count: Array.isArray(s.enrollments) ? s.enrollments.length : 0,
    }));

    return { data: students, count: count ?? 0 };
  } catch (err) {
    console.error("fetchStudents failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * What deleting this student would destroy.
 *
 * Every table referencing `students` cascades, so a delete is far wider than
 * one row. The confirm dialog shows these numbers, and the revenue total in
 * particular, so nobody removes paid order history by accident.
 */
export async function fetchStudentDeletionImpact(studentId: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = studentIdSchema.safeParse(studentId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const id = parsedId.data;

    const [student, enrollments, attempts, orders] = await Promise.all([
      supabase.from("students").select("full_name, email").eq("id", id).single(),
      supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("student_id", id),
      supabase.from("test_attempts").select("id", { count: "exact", head: true }).eq("student_id", id),
      supabase.from("orders").select("final_amount, status").eq("student_id", id),
    ]);

    if (student.error || !student.data) {
      return { error: "Student not found." };
    }

    const orderRows = orders.data ?? [];
    const paidRevenue = orderRows
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + Number(o.final_amount ?? 0), 0);

    return {
      data: {
        fullName: student.data.full_name,
        email: student.data.email,
        enrollmentCount: enrollments.count ?? 0,
        testAttemptCount: attempts.count ?? 0,
        orderCount: orderRows.length,
        paidOrderCount: orderRows.filter((o) => o.status === "completed").length,
        paidRevenue,
      },
    };
  } catch (err) {
    console.error("fetchStudentDeletionImpact failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteStudent(studentId: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = studentIdSchema.safeParse(studentId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    // Deleting zero rows is not an error to PostgREST, and RLS refusing the
    // delete looks exactly like success. Count the affected rows so a blocked
    // delete cannot be reported as a completed one.
    const { data, error } = await supabase
      .from("students")
      .delete()
      .eq("id", parsedId.data)
      .select("id");

    if (error) {
      console.error("deleteStudent failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    if (!data || data.length === 0) {
      return { error: "Student was not deleted. Only a super admin can remove a student." };
    }

    revalidatePath("/admin/students");
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("deleteStudent failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchStudentDetail(studentId: string) {
  try {
    await assertAdmin(["super_admin", "teacher", "support_staff"]);
    const supabase = await createClient();

    const parsedId = studentIdSchema.safeParse(studentId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: student, error } = await supabase
      .from("students")
      .select(
        `id, user_id, full_name, email, phone, avatar_url, class, city, state, status,
         board, school_name, referral_code, wallet_balance, created_at, updated_at,
         student_code, registration_source, registered_by, profile_completed,
         profile_completed_at, parent_name, parent_phone, date_of_birth, gender,
         address_line, pincode, admin_notes`
      )
      .eq("id", parsedId.data)
      .single();

    if (error) {
      console.error("fetchStudentDetail failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    const studentRecord: Record<string, unknown> = { ...student };

    const [enrollments, testAttempts, orders, auditLog] = await Promise.all([
      supabase
        .from("enrollments")
        .select("*, course:courses(id, title)")
        .eq("student_id", parsedId.data)
        .order("purchased_at", { ascending: false }),
      supabase
        .from("test_attempts")
        .select("*, test:tests(name)")
        .eq("student_id", parsedId.data)
        .order("submitted_at", { ascending: false })
        .limit(50),
      supabase
        .from("orders")
        .select("*, course:courses(title)")
        .eq("student_id", parsedId.data)
        .order("created_at", { ascending: false }),
      // user_id is NOT NULL again as of 20261101260000, but the generated
      // types are only as current as the last regeneration -- and a row
      // created while the constraint was briefly off would still be here.
      // Narrowing rather than asserting keeps this correct either way.
      student.user_id
        ? supabase
            .from("audit_log")
            .select("id, action, entity_type, entity_id, created_at")
            .eq("user_id", student.user_id)
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Map course.title → course.name for component compatibility
    const mappedEnrollments = (enrollments.data ?? []).map((e) => {
      const course = e.course as { id: string; title: string } | null;
      return { ...e, course: course ? { id: course.id, name: course.title } : null };
    });
    const mappedOrders = (orders.data ?? []).map((o) => {
      const course = o.course as { title: string } | null;
      return { ...o, course: course ? { name: course.title } : null };
    });

    return {
      data: {
        student: studentRecord,
        enrollments: mappedEnrollments,
        testAttempts: testAttempts.data ?? [],
        orders: mappedOrders,
        auditLog: auditLog.data ?? [],
      },
    };
  } catch (err) {
    console.error("fetchStudentDetail failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateStudentStatus(
  studentId: string,
  status: "active" | "inactive" | "blocked"
) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsed = studentStatusUpdateSchema.safeParse({ studentId, status });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase
      .from("students")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.studentId);

    if (error) {
      console.error("updateStudentStatus failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students");
    return { success: true };
  } catch (err) {
    console.error("updateStudentStatus failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: "active" | "inactive" | "blocked"
) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsed = bulkStudentStatusUpdateSchema.safeParse({ studentIds, status });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase
      .from("students")
      .update({ status: parsed.data.status })
      .in("id", parsed.data.studentIds);

    if (error) {
      console.error("bulkUpdateStudentStatus failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students");
    return { success: true };
  } catch (err) {
    console.error("bulkUpdateStudentStatus failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchStudentAnalytics() {
  try {
    await assertAdmin(["super_admin", "teacher", "support_staff"]);
    const supabase = await createClient();

    const [
      { data: students },
      { data: enrollments },
    ] = await Promise.all([
      supabase.from("students").select("id, status, city, created_at"),
      supabase.from("enrollments").select("course_id, courses(title)"),
    ]);

    const statusDist: Record<string, number> = { active: 0, inactive: 0, blocked: 0 };
    const cityDist: Record<string, number> = {};
    const monthlyGrowth: Record<string, number> = {};

    (students ?? []).forEach((s) => {
      statusDist[s.status] = (statusDist[s.status] || 0) + 1;

      const city = s.city || "Unknown";
      cityDist[city] = (cityDist[city] || 0) + 1;

      if (s.created_at) {
        const month = s.created_at.slice(0, 7);
        monthlyGrowth[month] = (monthlyGrowth[month] || 0) + 1;
      }
    });

    const courseDist: Record<string, number> = {};
    (enrollments ?? []).forEach((e: Record<string, unknown>) => {
      const course = e.courses as { title: string } | null;
      const name = course?.title ?? "Unknown";
      courseDist[name] = (courseDist[name] || 0) + 1;
    });

    return {
      data: {
        total: students?.length ?? 0,
        statusDistribution: Object.entries(statusDist).map(([name, value]) => ({
          name,
          value,
        })),
        cityDistribution: Object.entries(cityDist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, value]) => ({ name, value })),
        monthlyGrowth: Object.entries(monthlyGrowth)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, count]) => ({ month, count })),
        courseDistribution: Object.entries(courseDist)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value]) => ({ name, value })),
      },
    };
  } catch (err) {
    console.error("fetchStudentAnalytics failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function fetchCoursesList() {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { data } = await supabase
      .from("courses")
      .select("id, title")
      .eq("is_published", true)
      .order("title");
    return (data ?? []).map((c) => ({ id: c.id, name: c.title }));
  } catch (err) {
    console.error("fetchCoursesList failed:", err);
    return [];
  }
}

// --- Leads ---

export async function fetchLeads(filters: { search?: string; status?: string; source?: string } = {}) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    let query = supabase
      .from("leads")
      .select("id, name, email, phone, source, status, remarks, created_at", { count: "exact" });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe.length > 0) {
        query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }
    }

    const parsedFilters = leadListFilterSchema.safeParse({ status: filters.status });
    if (!parsedFilters.success) {
      return { error: firstIssue(parsedFilters.error) };
    }

    const statusFilter = parsedFilters.data.status;
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (filters.source && filters.source !== "all") {
      query = query.eq("source", filters.source);
    }

    const { data, count, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("fetchLeads failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    return { data: data ?? [], count: count ?? 0 };
  } catch (err) {
    console.error("fetchLeads failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function createLead(formData: FormData) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsed = leadCreateSchema.safeParse(leadCreateInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase.from("leads").insert({
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      source: parsed.data.source,
      status: "new",
      remarks: parsed.data.remarks ?? null,
    });

    if (error) {
      console.error("createLead failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/leads");
    return { success: true };
  } catch (err) {
    console.error("createLead failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateLead(
  id: string,
  updates: { status?: string; remarks?: string }
) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = leadIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = leadUpdateSchema.safeParse(updates);
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase
      .from("leads")
      .update({
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.remarks !== undefined ? { remarks: parsed.data.remarks } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsedId.data);

    if (error) {
      console.error("updateLead failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/leads");
    return { success: true };
  } catch (err) {
    console.error("updateLead failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteLead(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = leadIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase.from("leads").delete().eq("id", parsedId.data);

    if (error) {
      console.error("deleteLead failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/leads");
    return { success: true };
  } catch (err) {
    console.error("deleteLead failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Marks a lead as converted.
 *
 * It deliberately does NOT create a `students` row. `students.user_id` is NOT
 * NULL and references `auth.users`, and every student-facing RLS policy
 * resolves access through it -- a row with no auth user behind it would be
 * invisible to the person it describes and unreachable by the policies. An
 * earlier version inserted without `user_id` on the assumption the column had
 * been made nullable; it never was, so the insert failed on every call.
 *
 * The student record is created the moment the person registers, which is the
 * only point at which there is an auth user to attach it to. Until there is an
 * invite flow that provisions one, converting means "this lead signed up" and
 * the lead is flagged so it drops out of the active pipeline.
 */
export async function convertLeadToStudent(leadId: string) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = leadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("id, name, email, phone, status")
      .eq("id", parsedId.data)
      .single();

    if (fetchError || !lead) return { error: "Lead not found" };

    // If they already registered, the student row exists and the lead is
    // simply catching up with reality.
    let alreadyRegistered = false;
    if (lead.email) {
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("email", lead.email)
        .maybeSingle();
      alreadyRegistered = !!existing;
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", parsedId.data);

    if (updateError) {
      console.error("convertLeadToStudent failed:", updateError);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/leads");
    revalidatePath("/admin/students");

    return {
      success: true,
      message: alreadyRegistered
        ? "Lead marked as converted; their student account already exists."
        : "Lead marked as converted. They will appear under Students once they register with this email.",
    };
  } catch (err) {
    console.error("convertLeadToStudent failed:", err);
    return { error: describeFailure(err) };
  }
}

// --- Testimonials ---

export async function fetchTestimonials() {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("testimonials")
      .select("id, student_name, student_photo_url, content, video_url, rating, class, type, year, is_visible, weight, created_at")
      .order("weight", { ascending: true });

    if (error) {
      console.error("fetchTestimonials failed:", error);
      return { error: "Something went wrong. Please try again." };
    }
    // Map DB columns to match Testimonial interface from database.ts
    const mapped = (data ?? []).map((t) => ({
      ...t,
      photo_url: t.student_photo_url,
      course_name: null,
      marks_or_rank: null,
      is_topper: false,
    }));
    return { data: mapped };
  } catch (err) {
    console.error("fetchTestimonials failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function createTestimonial(formData: FormData) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsed = testimonialSchema.safeParse(testimonialInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { count } = await supabase
      .from("testimonials")
      .select("id", { count: "exact", head: true });

    const { data: created, error } = await supabase
      .from("testimonials")
      .insert({
        student_name: parsed.data.student_name,
        content: parsed.data.content ?? null,
        video_url: parsed.data.video_url ?? null,
        type: parsed.data.type,
        year: parsed.data.year ?? String(new Date().getFullYear()),
        course_name: parsed.data.course_name ?? null,
        marks_or_rank: parsed.data.marks_or_rank ?? null,
        is_topper: parsed.data.is_topper,
        is_visible: true,
        weight: (count ?? 0) + 1,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("createTestimonial failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    revalidatePath("/");
    // The id goes back so the caller can attach a photo, which needs a row to
    // hang the storage path off.
    return { success: true, id: created.id as string };
  } catch (err) {
    console.error("createTestimonial failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateTestimonial(id: string, formData: FormData) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = testimonialIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = testimonialSchema.safeParse(testimonialInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error } = await supabase
      .from("testimonials")
      .update({
        student_name: parsed.data.student_name,
        content: parsed.data.content ?? null,
        video_url: parsed.data.video_url ?? null,
        type: parsed.data.type,
        year: parsed.data.year ?? String(new Date().getFullYear()),
        course_name: parsed.data.course_name ?? null,
        marks_or_rank: parsed.data.marks_or_rank ?? null,
        is_topper: parsed.data.is_topper,
      })
      .eq("id", parsedId.data);

    if (error) {
      console.error("updateTestimonial failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    revalidatePath("/");
    return { success: true, id: parsedId.data };
  } catch (err) {
    console.error("updateTestimonial failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Photos for testimonial and topper cards.
 *
 * The bucket is public because these render on the signed-out landing page,
 * so a signed URL would cost a round trip per card and buy nothing. The file
 * is keyed by testimonial id, which is why a new testimonial is inserted
 * first and the photo attached second.
 */
const TESTIMONIAL_PHOTO_BUCKET = "testimonial-photos";

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

const ALLOWED_PHOTO_EXTS = ["jpg", "jpeg", "png", "webp", "avif"];

export async function uploadTestimonialPhoto(
  testimonialId: string,
  formData: FormData
) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = testimonialIdSchema.safeParse(testimonialId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const file = formData.get("photo") as File | null;
    if (!file || file.size === 0) {
      return { error: "No photo provided." };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { error: "Photo must be under 2MB." };
    }

    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      return { error: "Only JPEG, PNG, WebP and AVIF images are allowed." };
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_PHOTO_EXTS.includes(ext)) {
      return { error: "Invalid file extension." };
    }

    const path = `testimonials/${parsedId.data}/photo.${ext}`;

    // A replacement that arrives as a different format would otherwise leave
    // the old file behind, still public and still paid for.
    await supabase.storage
      .from(TESTIMONIAL_PHOTO_BUCKET)
      .remove(
        ALLOWED_PHOTO_EXTS.filter((e) => e !== ext).map(
          (e) => `testimonials/${parsedId.data}/photo.${e}`
        )
      );

    const { error: uploadError } = await supabase.storage
      .from(TESTIMONIAL_PHOTO_BUCKET)
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error("uploadTestimonialPhoto failed:", uploadError);
      return { error: "Something went wrong. Please try again." };
    }

    const { data: urlData } = supabase.storage
      .from(TESTIMONIAL_PHOTO_BUCKET)
      .getPublicUrl(path);

    // The path is stable across replacements, so without a version marker the
    // CDN and the browser both keep serving the previous photo.
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("testimonials")
      .update({ student_photo_url: publicUrl })
      .eq("id", parsedId.data);

    if (updateError) {
      console.error("uploadTestimonialPhoto failed:", updateError);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    revalidatePath("/");
    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("uploadTestimonialPhoto failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function removeTestimonialPhoto(testimonialId: string) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = testimonialIdSchema.safeParse(testimonialId);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    await supabase.storage
      .from(TESTIMONIAL_PHOTO_BUCKET)
      .remove(
        ALLOWED_PHOTO_EXTS.map((e) => `testimonials/${parsedId.data}/photo.${e}`)
      );

    const { error } = await supabase
      .from("testimonials")
      .update({ student_photo_url: null })
      .eq("id", parsedId.data);

    if (error) {
      console.error("removeTestimonialPhoto failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("removeTestimonialPhoto failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function toggleTestimonialVisibility(id: string, visible: boolean) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedId = testimonialIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("testimonials")
      .update({ is_visible: visible })
      .eq("id", parsedId.data);

    if (error) {
      console.error("toggleTestimonialVisibility failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    return { success: true };
  } catch (err) {
    console.error("toggleTestimonialVisibility failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteTestimonial(id: string) {
  try {
    await assertAdmin(["super_admin"]);
    const supabase = await createClient();

    const parsedId = testimonialIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("testimonials")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      console.error("deleteTestimonial failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    return { success: true };
  } catch (err) {
    console.error("deleteTestimonial failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function reorderTestimonials(orderedIds: string[]) {
  try {
    await assertAdmin(["super_admin", "support_staff"]);
    const supabase = await createClient();

    const parsedIds = testimonialOrderSchema.safeParse(orderedIds);
    if (!parsedIds.success) {
      return { error: firstIssue(parsedIds.error) };
    }

    const updates = parsedIds.data.map((id, index) =>
      supabase.from("testimonials").update({ weight: index + 1 }).eq("id", id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed?.error) {
      console.error("reorderTestimonials failed:", failed.error);
      return { error: "Something went wrong. Please try again." };
    }

    revalidatePath("/admin/students/testimonials");
    return { success: true };
  } catch (err) {
    console.error("reorderTestimonials failed:", err);
    return { error: describeFailure(err) };
  }
}
