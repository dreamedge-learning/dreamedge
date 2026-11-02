import type { Metadata } from "next";

import { PaymentHistoryContent } from "@/components/student/dashboard/payment-history-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Payment history",
};

/**
 * One place to look up every order a student has made.
 *
 * The row count is small (one per enrolment and the few free attempts
 * around it), so paging is deferred until a real student has enough to
 * need it. The admin side keeps its own paginated table in Revenue; this
 * is just the student's receipts and invoice links.
 *
 * Mirrors the Flutter PaymentHistoryScreen by eye -- same card layout,
 * same status chip colours, same "Download invoice" action under an
 * expanded row -- so a student moving between phone and desktop sees
 * the same thing in the same place.
 */

export interface StudentOrder {
  id: string;
  courseId: string;
  courseTitle: string | null;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  paymentMethod: string;
  status: "pending" | "completed" | "failed" | "refunded" | string;
  razorpayPaymentId: string | null;
  invoiceUrl: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

interface OrderRow {
  id: string;
  course_id: string;
  amount: number | string | null;
  discount_amount: number | string | null;
  final_amount: number | string | null;
  payment_method: string | null;
  status: string | null;
  razorpay_payment_id: string | null;
  invoice_url: string | null;
  invoice_number: string | null;
  created_at: string;
  courses: { title: string | null } | { title: string | null }[] | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNumber(value: number | string | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default async function PaymentHistoryPage() {
  const student = await requireCompleteStudentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, course_id, amount, discount_amount, final_amount, payment_method,
       status, razorpay_payment_id, invoice_url, invoice_number, created_at,
       courses(title)`
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as OrderRow[];
  const orders: StudentOrder[] = rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    courseTitle: one(row.courses)?.title ?? null,
    amount: toNumber(row.amount),
    discountAmount: toNumber(row.discount_amount),
    finalAmount: toNumber(row.final_amount),
    paymentMethod: row.payment_method ?? "razorpay",
    status: row.status ?? "pending",
    razorpayPaymentId: row.razorpay_payment_id,
    invoiceUrl: row.invoice_url,
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
  }));

  return <PaymentHistoryContent orders={orders} />;
}
