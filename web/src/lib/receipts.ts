import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { absoluteUrl } from "@/lib/site";

/**
 * Receipts and tax invoices.
 *
 * The database issues them: a trigger on `orders` numbers each completed
 * order in the financial year's series and freezes what the paper says into
 * `invoice_snapshot` (see 20261105074910_receipts.sql). Everything here reads
 * that snapshot, so a receipt shows what was true when it was issued even if
 * the business address or GST registration has changed since.
 */

export type ReceiptKind = "receipt" | "tax_invoice";

export interface ReceiptSnapshot {
  kind: ReceiptKind;
  seller: {
    legal_name: string;
    address: string;
    state: string;
    state_code: string;
    gstin: string | null;
  };
  buyer: {
    name: string | null;
    student_code: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
  };
  course_title: string | null;
  sac_code: string;
  place_of_supply: string;
  intra_state: boolean;
  gst_rate: number;
  list_price: number;
  discount: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  footer_note: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads a stored snapshot defensively. Null when there is nothing to show. */
export function parseReceiptSnapshot(raw: unknown): ReceiptSnapshot | null {
  const source = record(raw);
  if (Object.keys(source).length === 0) return null;

  const seller = record(source.seller);
  const buyer = record(source.buyer);

  return {
    kind: source.kind === "tax_invoice" ? "tax_invoice" : "receipt",
    seller: {
      legal_name: text(seller.legal_name) ?? "Dream Edge",
      address: text(seller.address) ?? "",
      state: text(seller.state) ?? "",
      state_code: text(seller.state_code) ?? "",
      gstin: text(seller.gstin),
    },
    buyer: {
      name: text(buyer.name),
      student_code: text(buyer.student_code),
      email: text(buyer.email),
      phone: text(buyer.phone),
      city: text(buyer.city),
      state: text(buyer.state),
    },
    course_title: text(source.course_title),
    sac_code: text(source.sac_code) ?? "999293",
    place_of_supply: text(source.place_of_supply) ?? text(seller.state) ?? "",
    intra_state: source.intra_state !== false,
    gst_rate: amount(source.gst_rate),
    list_price: amount(source.list_price),
    discount: amount(source.discount),
    taxable_value: amount(source.taxable_value),
    cgst: amount(source.cgst),
    sgst: amount(source.sgst),
    igst: amount(source.igst),
    total: amount(source.total),
    footer_note: text(source.footer_note),
  };
}

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Paise shown, unlike the dashboard's rounded figures: this is a tax document. */
export function formatReceiptAmount(value: number): string {
  return rupees.format(value);
}

// ─── Words ───
//
// Indian invoices state the total in words, in lakh and crore. Not required by
// Rule 46, but parents and auditors expect it, and it is what stops "1,199"
// being read as "11,99".

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const rest = n % 10;
  return TENS[Math.floor(n / 10)] + (rest ? ` ${ONES[rest]}` : "");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

function wholeInWords(n: number): string {
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${wholeInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "Rupees One Thousand One Hundred Ninety Nine and Fifty Paise Only". */
export function amountInWords(value: number): string {
  const paiseTotal = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const words = `Rupees ${wholeInWords(whole)}`;
  return paise ? `${words} and ${belowHundred(paise)} Paise Only` : `${words} Only`;
}

// ─── Links for the app ───
//
// The app signs in with a bearer token, not the website's cookie, so a plain
// link would open the browser to a sign-in page. The app asks
// /api/receipts/[id]/link instead, which checks the order is the caller's and
// returns this: the receipt address with a signature that expires in fifteen
// minutes. The key is derived from the service role key, so there is no new
// secret to configure, and a leaked link opens one receipt, briefly.

const LINK_LIFETIME_SECONDS = 15 * 60;

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createHmac("sha256", key).update("dream-edge:receipt-links:v1").digest("hex");
}

function signature(orderId: string, expires: number): string {
  return createHmac("sha256", signingKey())
    .update(`${orderId}:${expires}`)
    .digest("base64url");
}

export function signedReceiptUrl(orderId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + LINK_LIFETIME_SECONDS;
  const token = `${expires}.${signature(orderId, expires)}`;
  return absoluteUrl(`/receipt/${orderId}?t=${encodeURIComponent(token)}`);
}

export function verifyReceiptToken(
  orderId: string,
  token: string | undefined,
  now = Date.now()
): boolean {
  if (!token) return false;
  const [rawExpires, given] = token.split(".");
  const expires = Number(rawExpires);
  if (!Number.isInteger(expires) || !given) return false;
  if (expires < Math.floor(now / 1000)) return false;

  const expected = Buffer.from(signature(orderId, expires));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
