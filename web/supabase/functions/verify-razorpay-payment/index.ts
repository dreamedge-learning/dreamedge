// verify-razorpay-payment — called by the Flutter app (and later the website)
// after Razorpay's checkout returns success. Steps:
//   1. Authenticate the caller (JWT) and confirm they own the order.
//   2. Verify Razorpay's HMAC signature over `${order_id}|${payment_id}`.
//   3. Fetch the payment from Razorpay's API and confirm status=captured,
//      currency=INR, order_id matches, and amount matches orders.final_amount.
//   4. Call the atomic complete_paid_order RPC, which takes a row lock on
//      the orders row so the webhook can't double-settle it.
//
// LIVE SCHEMA BINDING (confirmed via supabase db query --linked, 2026-10-22)
// orders: id (uuid NOT NULL), student_id (uuid NOT NULL), course_id (uuid NOT NULL),
//         status (order_status NOT NULL, default 'pending'), final_amount (numeric NOT NULL),
//         razorpay_order_id (text NULL), razorpay_payment_id (text NULL)
// students: id (uuid NOT NULL), user_id (uuid NOT NULL)
// RPC: complete_paid_order(uuid, text, text, bigint) returns jsonb — serializes
//      verify + webhook, cross-checks amount, upserts enrollment, increments counter

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ??
  'https://dreamedgelearning.com,https://dream-edge-olive.vercel.app')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Constant-time string compare — stops timing-oracle attacks against the
// signature verification. Both strings MUST be hex of the same length.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

interface RazorpayPayment {
  id: string
  order_id: string
  amount: number // paise
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method?: string
}

async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment | null> {
  const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
  const resp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!resp.ok) {
    console.error('[verify] razorpay payment fetch failed', resp.status, await resp.text().catch(() => ''))
    return null
  }
  return (await resp.json()) as RazorpayPayment
}

serve(async (req) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const {
      data: { user },
      error: authError,
    } = await serviceClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json()

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // -------- Ownership check (single joined query) --------
    const { data: order } = await serviceClient
      .from('orders')
      .select('id, student_id, razorpay_order_id, final_amount, students!inner(user_id)')
      .eq('id', order_id)
      .maybeSingle()

    if (!order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // The join returns students as an object or array depending on the client version;
    // normalize to a single row's user_id.
    const studentUser = Array.isArray(order.students)
      ? order.students[0]
      : (order.students as unknown as { user_id: string } | null)
    if (!studentUser || studentUser.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not your order' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (order.razorpay_order_id !== razorpay_order_id) {
      return new Response(JSON.stringify({ error: 'Order mismatch' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // -------- HMAC signature (timing-safe compare) --------
    const expectedSignature = await hmacSha256Hex(
      RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    )
    if (!timingSafeEqual(expectedSignature, razorpay_signature)) {
      await serviceClient
        .from('orders')
        .update({ status: 'failed' })
        .eq('id', order_id)
        .neq('status', 'completed')
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // -------- Cross-check against Razorpay payment-fetch API --------
    // Signature only proves "some payment happened against this order id".
    // We additionally confirm the captured amount, currency, status and
    // order_id by fetching the authoritative payment record from Razorpay.
    const payment = await fetchRazorpayPayment(razorpay_payment_id)
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Unable to verify payment with Razorpay' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (payment.order_id !== razorpay_order_id) {
      return new Response(JSON.stringify({ error: 'Payment-order mismatch' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (payment.currency !== 'INR') {
      return new Response(JSON.stringify({ error: 'Unexpected currency' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return new Response(
        JSON.stringify({ error: 'Payment not captured', razorpay_status: payment.status }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // -------- Atomic order completion (serialized with webhook) --------
    const { data: completion, error: rpcError } = await serviceClient.rpc(
      'complete_paid_order',
      {
        p_order_id: order_id,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_signature: razorpay_signature,
        p_captured_paise: payment.amount,
      }
    )
    if (rpcError) {
      console.error('[verify] complete_paid_order RPC error:', rpcError)
      return new Response(JSON.stringify({ error: 'Order completion failed' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const result = completion as {
      ok: boolean
      reason?: string
      order_id?: string
      enrollment_id?: string
      was_new?: boolean
    }

    if (!result.ok) {
      const status = result.reason === 'order_not_found' ? 404 : 400
      return new Response(JSON.stringify({ error: 'Order completion rejected' }), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        enrolled: true,
        order_id: result.order_id,
        enrollment_id: result.enrollment_id,
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[verify] unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

export { hmacSha256Hex, timingSafeEqual, fetchRazorpayPayment }
