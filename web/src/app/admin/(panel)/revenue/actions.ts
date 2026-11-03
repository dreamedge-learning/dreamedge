"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-guard";
import { sanitizeSearch } from "@/lib/search";
import { rangeEnd, rangeStart } from "@/lib/date-range";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";
import {
  manualPaymentInput,
  manualPaymentSchema,
  orderFilterSchema,
  referralCodeCreateSchema,
  referralCodeIdSchema,
  referralCodeInput,
  referralCodeUpdateSchema,
  refundFilterSchema,
  refundInitiateInput,
  refundInitiateSchema,
  refundProcessSchema,
  topCoursesLimitSchema,
} from "@/lib/validations/revenue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderFilters {
  search?: string;
  status?: string;
  paymentMethod?: string;
  courseId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderRow {
  id: string;
  student_id: string;
  course_id: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  status: string;
  invoice_url: string | null;
  invoice_number: string | null;
  referral_code_used: string | null;
  remarks: string | null;
  created_at: string;
  student: { full_name: string; phone: string | null; email: string | null } | null;
  course: { title: string } | null;
}

export interface OrderDetail extends OrderRow {
  processed_by: string | null;
  updated_at: string;
  enrollment: {
    id: string;
    purchased_at: string | null;
    valid_until: string | null;
    status: string;
  } | null;
}

export interface RefundFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface RefundRow {
  id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: string;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  order: {
    id: string;
    final_amount: number;
    student: { full_name: string } | null;
    course: { title: string } | null;
  } | null;
}

export interface ReferralCodeRow {
  id: string;
  code: string;
  student_id: string | null;
  discount_type: string;
  discount_value: number;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_url: string | null;
  final_amount: number;
  created_at: string;
  student: { full_name: string } | null;
  course: { title: string } | null;
}

export interface RevenueStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  refundRate: number;
  prevTotalRevenue: number;
  prevTotalOrders: number;
  prevAvgOrderValue: number;
  prevRefundRate: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  orderCount: number;
}

export interface DailyOrder {
  day: string;
  orderCount: number;
  revenue: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  orderCount: number;
  totalAmount: number;
}

export interface CourseRevenue {
  id: string;
  name: string;
  enrollmentCount: number;
  totalRevenue: number;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function fetchOrders(filters: OrderFilters = {}) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedFilters = orderFilterSchema.safeParse({
      status: filters.status,
      paymentMethod: filters.paymentMethod,
      courseId: filters.courseId,
    });

    if (!parsedFilters.success) {
      return { data: null, count: 0, error: firstIssue(parsedFilters.error) };
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("orders")
      .select(
        `id, student_id, course_id, amount, discount_amount, final_amount,
         payment_method, razorpay_order_id, razorpay_payment_id, status,
         invoice_url, invoice_number, referral_code_used, remarks, created_at,
         student:students(full_name, phone, email),
         course:courses(title)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe) {
        query = query.or(
          `razorpay_payment_id.ilike.%${safe}%,razorpay_order_id.ilike.%${safe}%,invoice_number.ilike.%${safe}%`
        );
      }
    }

    const status = parsedFilters.data.status;
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const paymentMethod = parsedFilters.data.paymentMethod;
    if (paymentMethod && paymentMethod !== "all") {
      query = query.eq("payment_method", paymentMethod);
    }

    const courseId = parsedFilters.data.courseId;
    if (courseId && courseId !== "all") {
      query = query.eq("course_id", courseId);
    }

    if (filters.dateFrom) {
      query = query.gte("created_at", rangeStart(filters.dateFrom));
    }

    if (filters.dateTo) {
      query = query.lte("created_at", rangeEnd(filters.dateTo));
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: OrderRow[] = (data ?? []).map((row) => ({
      id: row.id,
      student_id: row.student_id,
      course_id: row.course_id,
      amount: Number(row.amount),
      discount_amount: Number(row.discount_amount),
      final_amount: Number(row.final_amount),
      payment_method: row.payment_method,
      razorpay_order_id: row.razorpay_order_id,
      razorpay_payment_id: row.razorpay_payment_id,
      status: row.status,
      invoice_url: row.invoice_url,
      invoice_number: row.invoice_number,
      referral_code_used: row.referral_code_used,
      remarks: row.remarks,
      created_at: row.created_at,
      student: row.student as unknown as OrderRow["student"],
      course: row.course as unknown as OrderRow["course"],
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch (err) {
    console.error("fetchOrders failed:", err);
    return { data: null, count: 0, error: describeFailure(err) };
  }
}

export async function getOrderDetail(orderId: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedId = uuid("Order").safeParse(orderId);
    if (!parsedId.success) {
      return { data: null, error: firstIssue(parsedId.error) };
    }

    const orderResult = await supabase
      .from("orders")
      .select(
        `id, student_id, course_id, amount, discount_amount, final_amount,
         payment_method, razorpay_order_id, razorpay_payment_id, status,
         invoice_url, invoice_number, referral_code_used, remarks,
         processed_by, created_at, updated_at,
         student:students(full_name, phone, email),
         course:courses(title)`
      )
      .eq("id", parsedId.data)
      .single();

    if (orderResult.error) {
      return { data: null, error: orderResult.error.message };
    }

    const row = orderResult.data;

    // Try to find enrollment matching this order's student + course
    const enrollmentByOrder = await supabase
      .from("enrollments")
      .select("id, purchased_at, valid_until, status")
      .eq("student_id", row.student_id)
      .eq("course_id", row.course_id)
      .limit(1)
      .maybeSingle();

    const detail: OrderDetail = {
      id: row.id,
      student_id: row.student_id,
      course_id: row.course_id,
      amount: Number(row.amount),
      discount_amount: Number(row.discount_amount),
      final_amount: Number(row.final_amount),
      payment_method: row.payment_method,
      razorpay_order_id: row.razorpay_order_id,
      razorpay_payment_id: row.razorpay_payment_id,
      status: row.status,
      invoice_url: row.invoice_url,
      invoice_number: row.invoice_number,
      referral_code_used: row.referral_code_used,
      remarks: row.remarks,
      processed_by: row.processed_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      student: row.student as unknown as OrderDetail["student"],
      course: row.course as unknown as OrderRow["course"],
      enrollment: enrollmentByOrder.data ?? null,
    };

    return { data: detail, error: null };
  } catch (err) {
    console.error("getOrderDetail failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Manual Payments
// ---------------------------------------------------------------------------

export async function searchStudentsForPayment(query: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const safe = sanitizeSearch(query);
    if (!safe) return { data: [], error: null };

    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, phone, email")
      .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
      .eq("status", "active")
      .limit(20);

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("searchStudentsForPayment failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function fetchPublishedCourses() {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("courses")
      .select("id, title, price, original_price")
      .eq("is_published", true)
      .order("title");

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("fetchPublishedCourses failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function recordManualPayment(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsed = manualPaymentSchema.safeParse(manualPaymentInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const {
      student_id: studentId,
      course_id: courseId,
      amount,
      payment_method: paymentMethod,
      reference,
      remarks,
      validity_days: validityOverride,
    } = parsed.data;
    const paymentDate = parsed.data.payment_date ?? new Date().toISOString();

    // Check if enrollment already exists
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return { error: "Student already has an active enrollment for this course." };
    }

    // Get course details
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("price, validity_days")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return { error: "Course not found." };
    }

    const discountAmount = Math.max(0, Number(course.price) - amount);

    // The course's own validity, overridable per payment. An earlier note
    // here claimed `courses` no longer carried a validity column and hard-wired
    // a year; it does carry one, and a course sold as a six-month package was
    // quietly granting twelve.
    const validityDays = validityOverride ?? course.validity_days ?? 365;
    const validUntil = new Date(paymentDate);
    validUntil.setDate(validUntil.getDate() + validityDays);

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        student_id: studentId,
        course_id: courseId,
        amount: course.price,
        discount_amount: discountAmount,
        final_amount: amount,
        payment_method: paymentMethod,
        status: "completed",
        remarks:
          [remarks, reference ? `Ref: ${reference}` : null].filter(Boolean).join(" | ") ||
          null,
        processed_by: adminUser.id,
        created_at: paymentDate,
      })
      .select("id")
      .single();

    if (orderError) {
      return { error: orderError.message };
    }

    // Create enrollment
    const { error: enrollError } = await supabase
      .from("enrollments")
      .insert({
        student_id: studentId,
        course_id: courseId,
        payment_id: order.id,
        purchased_at: paymentDate,
        valid_until: validUntil.toISOString(),
        status: "active",
      });

    if (enrollError) {
      return { error: enrollError.message };
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "manual_payment_recorded",
      entity_type: "order",
      entity_id: order.id,
      new_data: {
        student_id: studentId,
        course_id: courseId,
        amount,
        validity_days: validityDays,
      },
    });

    revalidatePath("/admin/revenue");
    return { success: true, orderId: order.id };
  } catch (err) {
    console.error("recordManualPayment failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function fetchRefunds(filters: RefundFilters = {}) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("refunds")
      .select(
        `id, order_id, amount, reason, status, processed_by, processed_at, created_at,
         order:orders(id, final_amount, student:students(full_name), course:courses(title))`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    const parsedFilters = refundFilterSchema.safeParse({ status: filters.status });
    if (!parsedFilters.success) {
      return { data: null, count: 0, error: firstIssue(parsedFilters.error) };
    }

    const status = parsedFilters.data.status;
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (filters.dateFrom) {
      query = query.gte("created_at", rangeStart(filters.dateFrom));
    }
    if (filters.dateTo) {
      query = query.lte("created_at", rangeEnd(filters.dateTo));
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: RefundRow[] = (data ?? []).map((row) => {
      const order = row.order as unknown as {
        id: string;
        final_amount: number;
        student: { full_name: string } | null;
        course: { title: string } | null;
      } | null;

      return {
        id: row.id,
        order_id: row.order_id,
        amount: Number(row.amount),
        reason: row.reason,
        status: row.status,
        processed_by: row.processed_by,
        processed_at: row.processed_at,
        created_at: row.created_at,
        order: order
          ? {
              id: order.id,
              final_amount: Number(order.final_amount),
              student: order.student,
              course: order.course,
            }
          : null,
      };
    });

    return { data: rows, count: count ?? 0, error: null };
  } catch (err) {
    console.error("fetchRefunds failed:", err);
    return { data: null, count: 0, error: describeFailure(err) };
  }
}

export async function initiateRefund(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsed = refundInitiateSchema.safeParse(refundInitiateInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { order_id: orderId, amount, reason } = parsed.data;

    // Verify order exists and is refundable
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, final_amount, status")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { error: "Order not found." };
    }

    if (order.status !== "completed") {
      return { error: "Only completed orders can be refunded." };
    }

    if (amount > Number(order.final_amount)) {
      return { error: "Refund amount cannot exceed the order amount." };
    }

    // Check for existing pending refund
    const { data: existingRefund } = await supabase
      .from("refunds")
      .select("id")
      .eq("order_id", orderId)
      .in("status", ["requested", "approved"])
      .maybeSingle();

    if (existingRefund) {
      return { error: "A pending refund already exists for this order." };
    }

    const { error: insertError } = await supabase.from("refunds").insert({
      order_id: orderId,
      amount,
      reason,
      status: "requested",
    });

    if (insertError) {
      return { error: insertError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "refund_initiated",
      entity_type: "refund",
      entity_id: orderId,
      new_data: { amount, reason },
    });

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("initiateRefund failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function processRefund(
  refundId: string,
  action: "approved" | "rejected",
  reason?: string
) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsed = refundProcessSchema.safeParse({ refundId, action, reason });
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { data: refund, error: refundError } = await supabase
      .from("refunds")
      .select("id, order_id, amount, status")
      .eq("id", parsed.data.refundId)
      .single();

    if (refundError || !refund) {
      return { error: "Refund not found." };
    }

    if (refund.status !== "requested") {
      return { error: "Only requested refunds can be processed." };
    }

    // Update refund status
    const { error: updateError } = await supabase
      .from("refunds")
      .update({
        status: parsed.data.action,
        processed_by: adminUser.id,
        processed_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.refundId);

    if (updateError) {
      return { error: updateError.message };
    }

    // If approved, update order and enrollment status
    if (parsed.data.action === "approved") {
      await supabase
        .from("orders")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", refund.order_id);

      // Get order to find enrollment
      const { data: order } = await supabase
        .from("orders")
        .select("student_id, course_id")
        .eq("id", refund.order_id)
        .single();

      if (order) {
        await supabase
          .from("enrollments")
          .update({ status: "cancelled" })
          .eq("student_id", order.student_id)
          .eq("course_id", order.course_id)
          .eq("status", "active");
      }
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: `refund_${parsed.data.action}`,
      entity_type: "refund",
      entity_id: parsed.data.refundId,
      new_data: { action: parsed.data.action, reason: parsed.data.reason ?? null },
    });

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("processRefund failed:", err);
    return { error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function fetchInvoices(filters: {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("orders")
      .select(
        `id, invoice_number, invoice_url, final_amount, created_at,
         student:students(full_name),
         course:courses(title)`,
        { count: "exact" }
      )
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe) {
        query = query.or(
          `invoice_number.ilike.%${safe}%`
        );
      }
    }

    if (filters.dateFrom) {
      query = query.gte("created_at", rangeStart(filters.dateFrom));
    }
    if (filters.dateTo) {
      query = query.lte("created_at", rangeEnd(filters.dateTo));
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: InvoiceRow[] = (data ?? []).map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_url: row.invoice_url,
      final_amount: Number(row.final_amount),
      created_at: row.created_at,
      student: row.student as unknown as InvoiceRow["student"],
      course: row.course as unknown as InvoiceRow["course"],
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch (err) {
    console.error("fetchInvoices failed:", err);
    return { data: null, count: 0, error: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// Referral Codes
// ---------------------------------------------------------------------------

export async function fetchReferralCodes(filters: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("referral_codes")
      .select(
        `id, code, student_id, discount_type, discount_value,
         usage_count, max_uses, is_active, valid_until, created_by, created_at`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe) {
        query = query.ilike("code", `%${safe}%`);
      }
    }

    if (filters.status === "active") {
      query = query.eq("is_active", true);
    } else if (filters.status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: ReferralCodeRow[] = (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      student_id: row.student_id,
      discount_type: row.discount_type,
      discount_value: Number(row.discount_value),
      usage_count: row.usage_count,
      max_uses: row.max_uses,
      is_active: row.is_active,
      valid_until: row.valid_until,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch (err) {
    console.error("fetchReferralCodes failed:", err);
    return { data: null, count: 0, error: describeFailure(err) };
  }
}

export async function createReferralCode(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsed = referralCodeCreateSchema.safeParse(referralCodeInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const {
      code,
      discount_type: discountType,
      discount_value: discountValue,
      max_uses: maxUses,
      valid_until: validUntil,
    } = parsed.data;

    // Check uniqueness
    const { data: existing } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (existing) {
      return { error: "A referral code with this name already exists." };
    }

    const { error: insertError } = await supabase.from("referral_codes").insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      max_uses: maxUses ?? null,
      valid_until: validUntil ?? null,
      created_by: adminUser.id,
      is_active: true,
    });

    if (insertError) {
      return { error: insertError.message };
    }

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("createReferralCode failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function updateReferralCode(id: string, formData: FormData) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedId = referralCodeIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const parsed = referralCodeUpdateSchema.safeParse(referralCodeInput(formData));
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const { error: updateError } = await supabase
      .from("referral_codes")
      .update({
        discount_type: parsed.data.discount_type,
        discount_value: parsed.data.discount_value,
        max_uses: parsed.data.max_uses ?? null,
        valid_until: parsed.data.valid_until ?? null,
      })
      .eq("id", parsedId.data);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("updateReferralCode failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function toggleReferralCode(id: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedId = referralCodeIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { data: current, error: fetchError } = await supabase
      .from("referral_codes")
      .select("is_active")
      .eq("id", parsedId.data)
      .single();

    if (fetchError || !current) {
      return { error: "Referral code not found." };
    }

    const { error: updateError } = await supabase
      .from("referral_codes")
      .update({ is_active: !current.is_active })
      .eq("id", parsedId.data);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("toggleReferralCode failed:", err);
    return { error: describeFailure(err) };
  }
}

export async function deleteReferralCode(id: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedId = referralCodeIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { error: firstIssue(parsedId.error) };
    }

    const { error } = await supabase
      .from("referral_codes")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/revenue");
    return { success: true };
  } catch (err) {
    console.error("deleteReferralCode failed:", err);
    return { error: describeFailure(err) };
  }
}


// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function fetchRevenueAnalytics(dateRange: {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const [currentStats, prevStats, refundStats, prevRefundStats] = await Promise.all([
      supabase.rpc("get_revenue_stats", {
        start_date: dateRange.from,
        end_date: dateRange.to,
      }),
      supabase.rpc("get_revenue_stats", {
        start_date: dateRange.prevFrom,
        end_date: dateRange.prevTo,
      }),
      supabase.rpc("get_refund_stats", {
        start_date: dateRange.from,
        end_date: dateRange.to,
      }),
      supabase.rpc("get_refund_stats", {
        start_date: dateRange.prevFrom,
        end_date: dateRange.prevTo,
      }),
    ]);

    const current = currentStats.data as {
      total_revenue: number;
      total_orders: number;
      monthly_revenue: { month: string; revenue: number; order_count: number }[];
    } | null;

    const prev = prevStats.data as {
      total_revenue: number;
      total_orders: number;
    } | null;

    const refunds = refundStats.data as { total_refunds: number } | null;
    const prevRefunds = prevRefundStats.data as { total_refunds: number } | null;

    const totalRevenue = Number(current?.total_revenue ?? 0);
    const totalOrders = Number(current?.total_orders ?? 0);
    const prevTotalRevenue = Number(prev?.total_revenue ?? 0);
    const prevTotalOrders = Number(prev?.total_orders ?? 0);

    const totalRefunds = Number(refunds?.total_refunds ?? 0);
    const prevTotalRefunds = Number(prevRefunds?.total_refunds ?? 0);

    const stats: RevenueStats = {
      totalRevenue,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      refundRate: totalOrders > 0 ? (totalRefunds / totalOrders) * 100 : 0,
      prevTotalRevenue,
      prevTotalOrders,
      prevAvgOrderValue: prevTotalOrders > 0 ? prevTotalRevenue / prevTotalOrders : 0,
      prevRefundRate: prevTotalOrders > 0 ? (prevTotalRefunds / prevTotalOrders) * 100 : 0,
    };

    const monthlyRevenue: MonthlyRevenue[] = (current?.monthly_revenue ?? []).map((m) => ({
      month: m.month,
      revenue: Number(m.revenue),
      orderCount: Number(m.order_count),
    }));

    return { data: { stats, monthlyRevenue }, error: null };
  } catch (err) {
    console.error("fetchRevenueAnalytics failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function fetchPaymentMethodBreakdown(dateFrom: string, dateTo: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_payment_method_breakdown", {
      start_date: dateFrom,
      end_date: dateTo,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    const rows: PaymentMethodBreakdown[] = ((data ?? []) as {
      method: string;
      order_count: number;
      total_amount: number;
    }[]).map((r) => ({
      method: r.method,
      orderCount: Number(r.order_count),
      totalAmount: Number(r.total_amount),
    }));

    return { data: rows, error: null };
  } catch (err) {
    console.error("fetchPaymentMethodBreakdown failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function fetchDailyOrders(dateFrom: string, dateTo: string) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_daily_orders", {
      start_date: dateFrom,
      end_date: dateTo,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    const rows: DailyOrder[] = ((data ?? []) as {
      day: string;
      order_count: number;
      revenue: number;
    }[]).map((r) => ({
      day: r.day,
      orderCount: Number(r.order_count),
      revenue: Number(r.revenue),
    }));

    return { data: rows, error: null };
  } catch (err) {
    console.error("fetchDailyOrders failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}

export async function fetchCourseRevenue(limit = 10) {
  try {
    await assertAdmin(["super_admin", "accountant"]);
    const supabase = await createClient();

    const parsedLimit = topCoursesLimitSchema.safeParse(limit);
    if (!parsedLimit.success) {
      return { data: null, error: firstIssue(parsedLimit.error) };
    }

    const { data, error } = await supabase.rpc("get_top_courses", {
      result_limit: parsedLimit.data,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    // The function returns `json`, so the generated type is `Json` and the
    // shape has to be asserted here. It is built by the migration alongside
    // this call site, so the two move together.
    const raw = (data ?? []) as unknown as Array<{
      id: string;
      title: string;
      enrollment_count: number | string;
      total_revenue: number | string;
    }>;

    const rows: CourseRevenue[] = raw.map((r) => ({
      id: r.id,
      name: r.title,
      enrollmentCount: Number(r.enrollment_count),
      totalRevenue: Number(r.total_revenue),
    }));

    return { data: rows, error: null };
  } catch (err) {
    console.error("fetchCourseRevenue failed:", err);
    return { data: null, error: describeFailure(err) };
  }
}
