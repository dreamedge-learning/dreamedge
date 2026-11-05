import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  amountInWords,
  formatReceiptAmount,
  parseReceiptSnapshot,
  verifyReceiptToken,
  type ReceiptSnapshot,
} from "@/lib/receipts";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Receipt",
  robots: { index: false, follow: false },
};

/**
 * One order's receipt, or its GST tax invoice once the business is registered.
 *
 * Who may see it is decided by row security, not by this page: the signed-in
 * student's own orders, and finance staff for any order. The one exception is
 * a link the app asked for on the student's behalf, which carries a short-lived
 * signature (see lib/receipts.ts) and is read with the service role.
 *
 * Everything printed comes from the snapshot frozen when the receipt was
 * issued, never from today's settings.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_COLUMNS =
  "id, status, payment_method, razorpay_payment_id, final_amount, created_at, invoice_number, invoice_issued_at, invoice_snapshot";

interface ReceiptOrder {
  id: string;
  status: string;
  payment_method: string;
  razorpay_payment_id: string | null;
  created_at: string;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  invoice_snapshot: unknown;
}

const PAYMENT_METHODS: Record<string, string> = {
  razorpay: "Online (Razorpay)",
  manual_cash: "Cash",
  manual_upi: "UPI",
  manual_bank: "Bank transfer",
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

async function loadOrder(orderId: string, token: string | undefined) {
  if (verifyReceiptToken(orderId, token)) {
    const service = createServiceClient();
    const { data } = await service
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .maybeSingle();
    return data as ReceiptOrder | null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  return data as ReceiptOrder | null;
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderId } = await params;
  const { t } = await searchParams;
  if (!UUID.test(orderId)) notFound();

  const order = await loadOrder(orderId, t);
  if (!order) notFound();

  const snapshot = parseReceiptSnapshot(order.invoice_snapshot);
  const settings = await getSiteSettings();

  if (!order.invoice_number || !snapshot) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">No receipt yet</h1>
          <p className="mt-2 text-sm text-neutral-600">
            A receipt is issued as soon as the payment for this order completes.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-neutral-600">
          Keep this for your records. Questions? {settings.support_email}
        </p>
        <PrintButton />
      </div>

      <ReceiptDocument
        order={order}
        snapshot={snapshot}
        invoiceNumber={order.invoice_number}
        supportEmail={settings.support_email}
        supportPhone={settings.support_phone}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Always paper-white, whatever theme the site is in: this is a document to
  // print, and a dark receipt prints as a block of toner.
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  );
}

function ReceiptDocument({
  order,
  snapshot,
  invoiceNumber,
  supportEmail,
  supportPhone,
}: {
  order: ReceiptOrder;
  snapshot: ReceiptSnapshot;
  invoiceNumber: string;
  supportEmail: string;
  supportPhone: string;
}) {
  const isTaxInvoice = snapshot.kind === "tax_invoice";
  const issuedAt = order.invoice_issued_at ?? order.created_at;
  const buyerPlace = [snapshot.buyer.city, snapshot.buyer.state].filter(Boolean).join(", ");

  return (
    <article className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
      {order.status === "refunded" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          This order was refunded.
        </div>
      )}

      <header className="flex flex-col gap-6 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="font-serif text-2xl font-bold tracking-tight">
            {snapshot.seller.legal_name}
          </p>
          {snapshot.seller.address && (
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">
              {snapshot.seller.address}
            </p>
          )}
          {snapshot.seller.gstin && (
            <p className="mt-2 text-sm">
              <span className="text-neutral-500">GSTIN </span>
              <span className="font-mono font-medium">{snapshot.seller.gstin}</span>
            </p>
          )}
          <p className="mt-1 text-sm text-neutral-500">
            {supportEmail} · {supportPhone}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-orange">
            {isTaxInvoice ? "Tax invoice" : "Payment receipt"}
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <Pair label={isTaxInvoice ? "Invoice no." : "Receipt no."} value={invoiceNumber} mono />
            <Pair label="Date" value={dateFormatter.format(new Date(issuedAt))} />
            {isTaxInvoice && (
              <Pair
                label="Place of supply"
                value={
                  snapshot.intra_state && snapshot.seller.state_code
                    ? `${snapshot.place_of_supply} (${snapshot.seller.state_code})`
                    : snapshot.place_of_supply
                }
              />
            )}
          </dl>
        </div>
      </header>

      <section className="grid gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Billed to
          </p>
          <p className="mt-2 font-medium">{snapshot.buyer.name ?? "Student"}</p>
          {snapshot.buyer.student_code && (
            <p className="text-sm text-neutral-600">Student ID {snapshot.buyer.student_code}</p>
          )}
          {buyerPlace && <p className="text-sm text-neutral-600">{buyerPlace}</p>}
          {snapshot.buyer.email && (
            <p className="text-sm text-neutral-600">{snapshot.buyer.email}</p>
          )}
          {snapshot.buyer.phone && (
            <p className="text-sm text-neutral-600">{snapshot.buyer.phone}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Payment
          </p>
          <p className="mt-2 text-sm">
            {PAYMENT_METHODS[order.payment_method] ?? order.payment_method}
          </p>
          {order.razorpay_payment_id && (
            <p className="font-mono text-xs text-neutral-600">{order.razorpay_payment_id}</p>
          )}
          <p className="text-sm text-neutral-600">
            Paid on {dateFormatter.format(new Date(order.created_at))}
          </p>
        </div>
      </section>

      <section className="py-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 font-semibold">Description</th>
              {isTaxInvoice && <th className="pb-2 font-semibold">SAC</th>}
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100">
              <td className="py-3 pr-4">
                <p className="font-medium">{snapshot.course_title ?? "Course enrolment"}</p>
                <p className="text-xs text-neutral-500">Online coaching course</p>
              </td>
              {isTaxInvoice && <td className="py-3 font-mono">{snapshot.sac_code}</td>}
              <td className="py-3 text-right">{formatReceiptAmount(snapshot.list_price)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
          {snapshot.discount > 0 && (
            <Total label="Discount" value={`− ${formatReceiptAmount(snapshot.discount)}`} />
          )}
          {isTaxInvoice && (
            <>
              <Total label="Taxable value" value={formatReceiptAmount(snapshot.taxable_value)} />
              {snapshot.intra_state ? (
                <>
                  <Total
                    label={`CGST @ ${snapshot.gst_rate / 2}%`}
                    value={formatReceiptAmount(snapshot.cgst)}
                  />
                  <Total
                    label={`SGST @ ${snapshot.gst_rate / 2}%`}
                    value={formatReceiptAmount(snapshot.sgst)}
                  />
                </>
              ) : (
                <Total
                  label={`IGST @ ${snapshot.gst_rate}%`}
                  value={formatReceiptAmount(snapshot.igst)}
                />
              )}
            </>
          )}
          <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
            <dt>Total paid</dt>
            <dd>{formatReceiptAmount(snapshot.total)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-right text-xs text-neutral-600">
          {amountInWords(snapshot.total)}
        </p>
      </section>

      <footer className="space-y-2 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
        {isTaxInvoice ? (
          <p>Prices include GST. Tax is not payable on reverse charge basis.</p>
        ) : (
          <p>
            {snapshot.seller.legal_name} is not registered under GST, so no GST has been
            charged on this payment.
          </p>
        )}
        {snapshot.footer_note && <p className="whitespace-pre-line">{snapshot.footer_note}</p>}
        <p>This is a computer-generated document and needs no signature.</p>
      </footer>
    </article>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 sm:justify-end">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-600">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
