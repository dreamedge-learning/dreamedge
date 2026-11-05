import { NextResponse } from "next/server";

import { authenticateStudent } from "@/lib/content-access";
import { signedReceiptUrl } from "@/lib/receipts";

/**
 * A short-lived link to one of the caller's own receipts.
 *
 * For the app, which signs in with a bearer token the browser it opens will
 * not have. The order is read with the caller's own token, so row security
 * decides whether it is theirs; the link that comes back opens that receipt
 * alone, for fifteen minutes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const caller = await authenticateStudent(request);
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: order } = await caller.supabase
    .from("orders")
    .select("id, student_id, invoice_number")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.student_id !== caller.studentId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!order.invoice_number) {
    return NextResponse.json(
      { error: "This order has no receipt yet." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { url: signedReceiptUrl(order.id) },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
