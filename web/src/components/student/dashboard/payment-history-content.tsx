"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  Receipt,
  Download,
  RotateCcw,
} from "lucide-react";

import { formatINR } from "@/lib/format";
import type { StudentOrder } from "@/app/(student)/dashboard/payment-history/page";

/**
 * Student payment history.
 *
 * One card per order, status chip in the top-right, expand to see the
 * payment method, Razorpay payment id, discount, and the invoice link.
 * The layout stays single-column on phones so a long course title does
 * not push the status chip off-screen; the body of the card wraps on
 * any width without an ellipsis -- a student wants the whole title in
 * their own record.
 */

interface Props {
  orders: StudentOrder[];
}

export function PaymentHistoryContent({ orders }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Payment history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every course you have enrolled in, with the invoice to download.
        </p>
      </header>

      {orders.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Receipt className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-base font-semibold">No payments yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your receipts will appear here once you enrol in a course.
      </p>
      <Link
        href="/courses"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
      >
        Browse courses
      </Link>
    </div>
  );
}

function OrderCard({ order }: { order: StudentOrder }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <StatusIcon status={order.status} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug sm:text-base">
            {order.courseTitle ?? "Course"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            <span className="font-medium text-foreground/80">
              {formatINR(order.finalAmount)}
            </span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            {formatDateTime(order.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusChip status={order.status} />
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm">
          <dl className="space-y-2">
            <Row label="Payment method" value={formatMethod(order.paymentMethod)} />
            {order.razorpayPaymentId && (
              <Row
                label="Payment ID"
                value={order.razorpayPaymentId}
                mono
              />
            )}
            {order.invoiceNumber && (
              <Row label="Receipt number" value={order.invoiceNumber} mono />
            )}
            {order.discountAmount > 0 && (
              <Row
                label="Discount"
                value={`− ${formatINR(order.discountAmount)}`}
              />
            )}
            <Row label="Amount paid" value={formatINR(order.finalAmount)} strong />
          </dl>

          {(order.status === "completed" || order.status === "refunded") &&
            order.invoiceUrl && (
            <a
              href={order.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-orange bg-brand-orange/5 px-4 py-2 text-sm font-semibold text-brand-orange transition-colors hover:bg-brand-orange/10 sm:w-auto"
            >
              <Download className="h-4 w-4" />
              View receipt
            </a>
          )}

          {(order.status === "failed" || order.status === "pending") && (
            <Link
              href={`/courses?retry=${order.courseId}`}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          "min-w-0 break-words text-right text-sm" +
          (mono ? " font-mono" : "") +
          (strong ? " font-semibold" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  const color = statusColorClass(status);
  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "pending"
        ? Clock
        : AlertCircle;

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color.bg}`}
    >
      <Icon className={`h-5 w-5 ${color.text}`} />
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = statusColorClass(status);
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${color.bg} ${color.text}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function statusColorClass(status: string): { bg: string; text: string } {
  switch (status) {
    case "completed":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-700 dark:text-emerald-400",
      };
    case "pending":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-700 dark:text-amber-400",
      };
    case "refunded":
      return {
        bg: "bg-sky-500/10",
        text: "text-sky-700 dark:text-sky-400",
      };
    default:
      return {
        bg: "bg-rose-500/10",
        text: "text-rose-700 dark:text-rose-400",
      };
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Paid";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatMethod(method: string): string {
  switch (method) {
    case "razorpay":
      return "Online (Razorpay)";
    case "manual_cash":
      return "Cash at the centre";
    case "manual_upi":
      return "UPI at the centre";
    case "manual_bank":
      return "Bank transfer";
    default:
      return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
