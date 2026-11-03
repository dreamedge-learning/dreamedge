// send-push — dispatches an existing notifications row to the FCM HTTP v1
// API for every recipient's device_tokens.
//
// Called from the admin's `sendNotification` server action right after the
// notification row is created and (for in_app) fanned out to
// student_notifications. The function:
//
//   1. Authenticates the caller as an admin with the engage/push role.
//   2. Looks up the notifications row by id.
//   3. Resolves recipient students the same way the admin action does
//      (one student / one course / all active students).
//   4. Pulls their device_tokens (through students.user_id → device_tokens).
//   5. Exchanges FCM_SERVICE_ACCOUNT_JSON for a short-lived access token
//      against oauth2.googleapis.com/token, signing a JWT in a web-crypto
//      compatible RS256.
//   6. POSTs a message per token to
//      /v1/projects/{project_id}/messages:send, deleting any token the
//      API reports as invalid.
//   7. Returns {sent, failed, pruned} counts for the admin UI.
//
// Secrets expected on Supabase (settable through `supabase secrets set`):
//
//   FCM_PROJECT_ID             the Firebase project id (not the number)
//   FCM_SERVICE_ACCOUNT_JSON   the full JSON of a Firebase Admin SDK
//                              service account, including `private_key`
//
// When either is missing the function returns 503 with
// `{ error: 'push_not_configured' }` so the admin UI can tell the
// sender that FCM has not been wired up yet. The notification row and
// the in-app fan-out are already in the database, so a 503 here is a
// warning, not a lost send.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface NotificationRow {
  id: string
  title: string
  message: string
  action_url: string | null
  target_type: 'all' | 'course' | 'student' | string
  target_id: string | null
  course_id: string | null
}

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // The caller must be an authenticated admin. The service-role client is used
  // for lookups below, but authorisation goes through the caller's JWT first
  // so a leaked anon key cannot blind-fire push to every student.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userResult, error: userError } = await userClient.auth.getUser()
  if (userError || !userResult.user) {
    return json({ error: 'unauthorized' }, 401)
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: adminRow } = await service
    .from('admin_users')
    .select('id, role_id, is_active, roles(name)')
    .eq('user_id', userResult.user.id)
    .maybeSingle()

  const roleName = (adminRow as { roles?: { name?: string } } | null)?.roles?.name
  if (!adminRow || !adminRow.is_active || !roleName) {
    return json({ error: 'forbidden' }, 403)
  }
  if (!['super_admin', 'support_staff'].includes(roleName)) {
    return json({ error: 'forbidden' }, 403)
  }

  const body = (await req.json().catch(() => ({}))) as { notification_id?: string }
  if (!body.notification_id) {
    return json({ error: 'missing_notification_id' }, 400)
  }

  const { data: notification } = await service
    .from('notifications')
    .select(
      'id, title, message, action_url, target_type, target_id, course_id',
    )
    .eq('id', body.notification_id)
    .maybeSingle<NotificationRow>()

  if (!notification) return json({ error: 'notification_not_found' }, 404)

  const projectId = Deno.env.get('FCM_PROJECT_ID')
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
  if (!projectId || !saJson) {
    // Nothing to send to. Return a 503 so the admin UI can say "push not
    // configured" instead of pretending the message went out.
    return json({ error: 'push_not_configured' }, 503)
  }

  let serviceAccount: ServiceAccount
  try {
    serviceAccount = JSON.parse(saJson) as ServiceAccount
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('missing client_email or private_key')
    }
  } catch (err) {
    console.error('[send-push] bad service account JSON:', err)
    return json({ error: 'push_not_configured' }, 503)
  }

  const studentIds = await resolveStudentIds(service, notification)
  if (studentIds.length === 0) {
    return json({ sent: 0, failed: 0, pruned: 0, recipients: 0 })
  }

  // Students → user ids → device tokens. One join rather than two queries so
  // a thousand-student course does not fan out into a thousand lookups.
  const { data: studentRows } = await service
    .from('students')
    .select('id, user_id')
    .in('id', studentIds)

  const userIds = (studentRows ?? [])
    .map((r) => (r as { user_id: string | null }).user_id)
    .filter((id): id is string => Boolean(id))

  if (userIds.length === 0) {
    return json({ sent: 0, failed: 0, pruned: 0, recipients: 0 })
  }

  const { data: tokenRows } = await service
    .from('device_tokens')
    .select('id, token, platform')
    .in('user_id', userIds)

  const tokens = (tokenRows ?? []) as Array<{
    id: string
    token: string
    platform: string
  }>
  if (tokens.length === 0) {
    return json({ sent: 0, failed: 0, pruned: 0, recipients: studentIds.length })
  }

  let accessToken: string
  try {
    accessToken = await mintAccessToken(serviceAccount)
  } catch (err) {
    console.error('[send-push] mintAccessToken failed:', err)
    return json({ error: 'fcm_auth_failed' }, 502)
  }

  // The data payload carries the deep-link the Flutter tap handler reads out
  // of `message.data.route`. Keep every value a string -- FCM rejects nested
  // objects or numbers inside `data`.
  const data: Record<string, string> = {
    notification_id: notification.id,
  }
  if (notification.action_url) data.route = notification.action_url

  let sent = 0
  let failed = 0
  let pruned = 0
  const prunedIds: string[] = []

  for (const row of tokens) {
    const result = await sendFcmMessage({
      projectId,
      accessToken,
      token: row.token,
      title: notification.title,
      body: notification.message,
      data,
    })

    if (result.ok) {
      sent += 1
    } else if (result.invalid) {
      // Dead token. Delete it so a stale device cannot keep failing on every
      // future send.
      prunedIds.push(row.id)
      pruned += 1
    } else {
      failed += 1
    }
  }

  if (prunedIds.length > 0) {
    const { error: deleteError } = await service
      .from('device_tokens')
      .delete()
      .in('id', prunedIds)
    if (deleteError) {
      console.error('[send-push] token prune failed:', deleteError)
    }
  }

  return json({ sent, failed, pruned, recipients: studentIds.length })
})

async function resolveStudentIds(
  service: SupabaseClient,
  notification: NotificationRow,
): Promise<string[]> {
  if (notification.target_type === 'student' && notification.target_id) {
    return [notification.target_id]
  }
  if (notification.target_type === 'course' && notification.course_id) {
    const { data } = await service
      .from('enrollments')
      .select('student_id')
      .eq('course_id', notification.course_id)
      .eq('status', 'active')
    return Array.from(
      new Set(
        (data ?? [])
          .map((r) => (r as { student_id: string | null }).student_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
  }
  const { data } = await service.from('students').select('id').eq('status', 'active')
  return (data ?? []).map((r) => (r as { id: string }).id)
}

// --- FCM transport --------------------------------------------------------

/** Signs a JWT and swaps it for an OAuth 2.0 access token. */
async function mintAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encoder = new TextEncoder()
  const unsigned = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(
    encoder.encode(JSON.stringify(payload)),
  )}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(unsigned),
  )
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`

  const tokenResponse = await fetch(
    sa.token_uri || 'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    },
  )

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => '')
    throw new Error(`FCM auth ${tokenResponse.status}: ${text}`)
  }
  const tokenBody = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenBody.access_token) {
    throw new Error('FCM auth: no access_token in response')
  }
  return tokenBody.access_token
}

async function sendFcmMessage(args: {
  projectId: string
  accessToken: string
  token: string
  title: string
  body: string
  data: Record<string, string>
}): Promise<{ ok: boolean; invalid?: boolean }> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${args.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: args.token,
          notification: { title: args.title, body: args.body },
          data: args.data,
          android: {
            priority: 'HIGH',
            notification: { channel_id: 'dream_edge_main' },
          },
        },
      }),
    },
  )

  if (response.ok) return { ok: true }

  // FCM says the token is permanently invalid when the error code is
  // UNREGISTERED or SENDER_ID_MISMATCH, or the HTTP status is 404.
  const text = await response.text().catch(() => '')
  const invalid =
    response.status === 404 ||
    text.includes('UNREGISTERED') ||
    text.includes('SENDER_ID_MISMATCH')
  if (!invalid) {
    console.error(`[send-push] FCM ${response.status}: ${text.slice(0, 300)}`)
  }
  return { ok: false, invalid }
}

// --- PEM parsing + base64url ----------------------------------------------

function pemToPkcs8(pem: string): Uint8Array {
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(stripped)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
