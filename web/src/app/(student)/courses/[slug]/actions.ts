"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Payment flow — Edge Function backed (2026-10-30)
//
// The website no longer talks to api.razorpay.com and no longer writes to
// `enrollments` on the payment path. Both of those were broken:
//
//   * The old upsert set payment_status / payment_order_id / payment_amount,
//     none of which exist on the live `enrollments` table (live columns:
//     id, student_id, course_id, purchased_at, valid_until, payment_id uuid,
//     status, created_at). PostgREST rejected every upsert and the error was
//     never checked, so no enrolment was ever created.
//   * It wrote status:'active' BEFORE payment, and never created an `orders`
//     row, so admin revenue / invoice / refund screens saw zero website sales.
//
// Both now go through the already-deployed Edge Functions that the Flutter app
// uses, so web and mobile share one audited code path:
//
//   create-razorpay-order    re-derives the price from courses.price, rejects
//                            unpublished courses, blocks double-enrolment,
//                            dedupes pending orders for 15 min, inserts the
//                            `orders` row, calls Razorpay.
//   verify-razorpay-payment  checks order ownership, verifies the HMAC in
//                            constant time, re-fetches the payment from
//                            Razorpay to cross-check order/currency/status/
//                            amount, then calls the atomic complete_paid_order
//                            RPC — which is what actually creates the
//                            enrolment and increments student_count.
// ---------------------------------------------------------------------------

interface ActionResult<T = unknown> {
  data?: T;
  error?: string;
}

/**
 * The client component special-cases this exact string to redirect to /login,
 * so it must not change.
 */
const NOT_LOGGED_IN = "Please log in to continue";

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function getAuthContext(): Promise<
  { userId: string; accessToken: string } | { error: string }
> {
  const supabase = await createClient();

  // getUser() validates the JWT against the auth server — this is the gate.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { error: NOT_LOGGED_IN };

  // getSession() only reads the cookie; we use it purely to obtain the token we
  // forward to the Edge Functions, never as an authorization decision.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    return { error: "Your session has expired. Please log in again." };
  }

  return { userId: user.id, accessToken };
}

type EdgeResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

/**
 * POST to a Supabase Edge Function as the signed-in user.
 *
 * A plain fetch is used rather than supabase.functions.invoke() because invoke()
 * collapses non-2xx responses into a FunctionsHttpError and hides the JSON body
 * behind error.context, which makes it hard to surface the function's own
 * `error` message. Here the real reason always reaches the UI. (There was no
 * pre-existing Edge Function call anywhere in src/ to match a style against;
 * the Flutter client reads `body['error']` the same way.)
 */
async function invokeEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<EdgeResult<T>> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    return {
      error:
        "Payment service is not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/functions/v1/${name}`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error(`[${name}] network failure:`, err);
    return {
      error: `Could not reach the payment service: ${describe(err)}`,
    };
  }

  const raw = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Non-JSON body (gateway HTML, etc.) — handled below.
    }
  }

  if (!response.ok) {
    const fromBody =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error ?? "")
        : "";
    console.error(`[${name}] returned ${response.status}:`, raw.slice(0, 500));
    return {
      error:
        fromBody ||
        `Payment service error (${name} returned ${response.status})${
          raw ? `: ${raw.slice(0, 200)}` : ""
        }`,
    };
  }

  if (parsed === null || typeof parsed !== "object") {
    console.error(`[${name}] unexpected success body:`, raw.slice(0, 500));
    return { error: `Payment service returned an unreadable response (${name}).` };
  }

  return { data: parsed as T };
}

// ---------------------------------------------------------------------------
// Free enrolment
// ---------------------------------------------------------------------------

export async function enrollFree(
  courseId: string
): Promise<ActionResult<{ enrolled: boolean }>> {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return { error: auth.error };

    const supabase = await createClient();

    // enroll_free_course() resolves the student from the JWT, rejects anything
    // that is not published, refuses any course with a price, derives
    // valid_until from courses.validity_days and bumps student_count exactly
    // once -- all in one statement. Doing this in application code meant a
    // check-then-insert that could race the UNIQUE (student_id, course_id)
    // index, and duplicated the paid path's rules in a second place.
    const { data, error } = await supabase.rpc("enroll_free_course", {
      p_course_id: courseId,
    });

    if (error) {
      // 42501 is the function's own refusal: not published, or priced.
      if (error.code === "42501") {
        return { error: "This course is not available for free enrolment." };
      }
      return { error: `Could not enrol you: ${error.message}` };
    }

    const result = data as { ok?: boolean; was_new?: boolean } | null;
    if (!result?.ok) {
      return { error: "Could not enrol you. Please try again." };
    }

    revalidatePath("/courses");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/my-courses");

    return { data: { enrolled: true } };
  } catch (err) {
    console.error("[enrollFree] unexpected error:", err);
    return { error: `Something went wrong: ${describe(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Paid enrolment — step 1: create the order
// ---------------------------------------------------------------------------

/** Raw shape returned by the create-razorpay-order Edge Function. */
interface CreateOrderEdgeResponse {
  order_id: string;
  razorpay_order_id: string;
  /** RUPEES, re-derived server-side from courses.price. */
  amount: number;
  currency: string;
  key_id: string;
  prefill: {
    name: string | null;
    email: string | null;
    contact: string | null;
  };
}

interface PaymentOrder {
  /** Internal orders.id — MUST be handed back to verifyPayment. */
  orderId: string;
  /** Razorpay's order id — goes into checkout as options.order_id. */
  razorpayOrderId: string;
  /** Paise, for checkout. Derived from the Edge Function's amount only. */
  amountInPaise: number;
  /** Rupees, for display. */
  amount: number;
  currency: string;
  /** Razorpay key_id, supplied by the Edge Function. */
  key: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
}

export async function createPaymentOrder(
  courseId: string
): Promise<ActionResult<PaymentOrder>> {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return { error: auth.error };

    // The Edge Function is the single source of truth for price, publication
    // state, double-enrolment and the orders row. We deliberately do not
    // re-derive any of that here.
    const result = await invokeEdgeFunction<CreateOrderEdgeResponse>(
      "create-razorpay-order",
      { course_id: courseId },
      auth.accessToken
    );

    // `error` is typed `string | undefined`, so a falsy-but-present error (or a
    // 2xx body that simply carried no payload) would otherwise slip through with
    // `data` undefined. Both are real runtime cases for an Edge Function, so the
    // payload is required explicitly before anything is read off it.
    if (result.error !== undefined || result.data === undefined) {
      return {
        error:
          result.error ||
          "Payment service did not return any order details. Please try again.",
      };
    }

    const order = result.data;

    if (!order.razorpay_order_id || !order.order_id) {
      return { error: "Payment service returned an incomplete order." };
    }

    const amountInRupees = Number(order.amount);
    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return {
        error: `Payment service returned an invalid amount (${String(order.amount)}).`,
      };
    }

    if (!order.key_id) {
      return { error: "Payment service did not return a Razorpay key." };
    }

    return {
      data: {
        orderId: order.order_id,
        razorpayOrderId: order.razorpay_order_id,
        amountInPaise: Math.round(amountInRupees * 100),
        amount: amountInRupees,
        currency: order.currency || "INR",
        key: order.key_id,
        prefill: {
          name: order.prefill?.name ?? "",
          email: order.prefill?.email ?? "",
          contact: order.prefill?.contact ?? "",
        },
      },
    };
  } catch (err) {
    console.error("[createPaymentOrder] unexpected error:", err);
    return { error: `Something went wrong: ${describe(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Paid enrolment — step 2: verify and enrol
// ---------------------------------------------------------------------------

/** Raw shape returned by the verify-razorpay-payment Edge Function. */
interface VerifyEdgeResponse {
  enrolled: boolean;
  order_id?: string;
  enrollment_id?: string;
}

export async function verifyPayment(paymentData: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  /**
   * Internal orders.id from createPaymentOrder. Required by the Edge Function,
   * which resolves the student, course and expected amount from this row — so
   * nothing about the enrolment is taken from the browser any more.
   */
  orderId: string;
  /**
   * Accepted for backwards compatibility with the previous call shape, and
   * otherwise ignored. The old action updated `enrollments` by this
   * browser-supplied id without ever checking it against the stored order,
   * which let a caller point a real payment at a different course. The course
   * is now resolved server-side from `orders.course_id`.
   */
  courseId?: string;
}): Promise<
  ActionResult<{ enrolled: boolean; orderId?: string; enrollmentId?: string }>
> {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return { error: auth.error };

    if (!paymentData.orderId) {
      return { error: "Missing order reference. Please contact support." };
    }
    if (
      !paymentData.razorpay_order_id ||
      !paymentData.razorpay_payment_id ||
      !paymentData.razorpay_signature
    ) {
      return { error: "Incomplete payment response. Please contact support." };
    }

    // All verification (ownership, HMAC, Razorpay cross-check) and the actual
    // enrolment happen inside the Edge Function + complete_paid_order RPC.
    const result = await invokeEdgeFunction<VerifyEdgeResponse>(
      "verify-razorpay-payment",
      {
        order_id: paymentData.orderId,
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      },
      auth.accessToken
    );

    // Same two failure modes as above. A verify call that comes back without a
    // payload must never be treated as a confirmed payment.
    if (result.error !== undefined || result.data === undefined) {
      return {
        error:
          result.error ||
          "Payment could not be confirmed. Please contact support.",
      };
    }

    const verification = result.data;

    if (!verification.enrolled) {
      return { error: "Payment could not be confirmed. Please contact support." };
    }

    revalidatePath("/courses");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/my-courses");

    return {
      data: {
        enrolled: true,
        orderId: verification.order_id,
        enrollmentId: verification.enrollment_id,
      },
    };
  } catch (err) {
    console.error("[verifyPayment] unexpected error:", err);
    return { error: `Something went wrong: ${describe(err)}` };
  }
}
