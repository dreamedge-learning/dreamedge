// video-playback-token — the Flutter app's door to a playable video.
//
// The app authenticates to Supabase, not to Next.js, so it cannot use
// /api/content/[id]/video. This is the same contract reached a different way.
// Both ask check_offline_entitlements for the paywall verdict rather than
// restating it, so the website, the app and the app's reconnect sweep cannot
// come to different conclusions about who has paid for what.
//
// Two modes:
//   forDownload = false  streaming. An HLS URL plus the MP4 renditions, good
//                        for six hours, because a 50-minute lesson paused over
//                        dinner must not come back to a dead URL.
//   forDownload = true   offline. MP4 only, good for twelve hours, and a
//                        content_downloads row recording which device took it.
//                        HLS is withheld deliberately: downloading a playlist
//                        means downloading and reassembling a segment ladder,
//                        which is a great deal of fragile work for nothing the
//                        student would notice over a single MP4 file.
//
// A hosted video's URL is signed here and nowhere stored. Bunny's pull zone
// has token authentication on, so an unsigned URL is refused and a signed one
// expires -- which is what stops a paid lesson being forwarded.
//
// LIVE SCHEMA BINDING (confirmed via supabase db push --linked, 2026-11-02)
// content_items: id (uuid NOT NULL), status (content_status NOT NULL),
//                video_provider (text NOT NULL), bunny_video_guid (text NULL),
//                video_status (text NOT NULL), video_thumbnail_url (text NULL),
//                video_resolutions (text[] NOT NULL), duration_seconds (int NULL),
//                file_url (text NULL), poster_url (text NULL)
// content_downloads: student_id, content_item_id, device_id (all NOT NULL),
//                quality (text NULL), bytes (bigint NOT NULL),
//                unique (student_id, content_item_id, device_id)
// students: id (uuid NOT NULL), user_id (uuid NOT NULL), full_name, phone
// RPC: check_offline_entitlements(uuid) → see migration 20261102200000

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const BUNNY_CDN_HOSTNAME = Deno.env.get('BUNNY_STREAM_CDN_HOSTNAME') ?? ''
const BUNNY_TOKEN_KEY = Deno.env.get('BUNNY_STREAM_TOKEN_KEY') ?? ''

const STREAM_TTL_SECONDS = 60 * 60 * 6
const DOWNLOAD_TTL_SECONDS = 60 * 60 * 12

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

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      // The body carries credentials with a short life. A cached copy would
      // outlive the entitlement check that produced it.
      'Cache-Control': 'no-store, private',
    },
  })
}

// ---------------------------------------------------------------------------
// Bunny advanced token authentication.
//
// token = "HS256-" + base64url(HMAC-SHA256(tokenKey, signaturePath + expires +
//                                          signingData))
//
// The key is the HMAC key and is never part of the signed message. This
// mirrors web/src/lib/bunny.ts exactly; the two must stay in step, because a
// token minted by one has to validate at the same CDN as a token minted by the
// other.
// ---------------------------------------------------------------------------

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(signature)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Signs one path on the Stream pull zone.
 *
 * `tokenPath` switches to a directory token placed in the URL path rather than
 * its query string. That is the only arrangement that works for HLS: a player
 * resolves segment URLs relative to the manifest, so a token sitting in the
 * manifest's query string would never reach the segments and every one of them
 * would come back 403.
 */
async function signCdnUrl(
  pathname: string,
  expires: number,
  tokenPath?: string
): Promise<string> {
  const params = tokenPath ? { token_path: tokenPath } : {}
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))

  const signaturePath = tokenPath ?? pathname
  const signingData = entries.map(([k, v]) => `${k}=${v}`).join('&')
  const urlData = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

  const token =
    'HS256-' +
    base64Url(
      await hmacSha256(BUNNY_TOKEN_KEY, `${signaturePath}${expires}${signingData}`)
    )

  const base = `https://${BUNNY_CDN_HOSTNAME}`
  const tail = urlData ? `&${urlData}` : ''

  return tokenPath
    ? `${base}/bcdn_token=${token}${tail}&expires=${expires}${pathname}`
    : `${base}${pathname}?token=${token}${tail}&expires=${expires}`
}

async function signHls(guid: string, ttlSeconds: number): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  return await signCdnUrl(`/${guid}/playlist.m3u8`, expires, `/${guid}/`)
}

/**
 * Signed MP4 renditions keyed by height.
 *
 * Which renditions exist comes from Bunny rather than from a list here: a 480p
 * source never produces a 1080p rendition, and a library with MP4 fallback
 * switched off produces none at all.
 */
async function signMp4Map(
  guid: string,
  resolutions: string[],
  ttlSeconds: number
): Promise<Record<string, string>> {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const urls: Record<string, string> = {}

  for (const label of resolutions) {
    const height = label.replace(/[^0-9]/g, '')
    if (!height) continue
    urls[height] = await signCdnUrl(`/${guid}/play_${height}p.mp4`, expires)
  }

  return urls
}

async function signExisting(url: string, ttlSeconds: number): Promise<string> {
  try {
    const parsed = new URL(url)
    if (parsed.host !== BUNNY_CDN_HOSTNAME) return url
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds
    return await signCdnUrl(parsed.pathname, expires)
  } catch {
    return url
  }
}

interface RequestBody {
  contentItemId?: string
  forDownload?: boolean
  deviceId?: string
  quality?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed.' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json(req, { error: 'Not signed in.' }, 401)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid request.' }, 400)
  }

  const contentItemId = body.contentItemId
  if (!contentItemId || typeof contentItemId !== 'string') {
    return json(req, { error: 'Invalid request.' }, 400)
  }

  const forDownload = body.forDownload === true

  // A download is recorded against a device, and the row cannot be written
  // without one. Asking for it up front beats writing a row that claims the
  // copy went nowhere.
  if (forDownload && !body.deviceId) {
    return json(req, { error: 'Invalid request.' }, 400)
  }

  // Two clients, two jobs. The caller's client carries their JWT, so the
  // entitlement RPC resolves `current_student_id()` to them and cannot be
  // talked into answering about somebody else. The service client reads the
  // row afterwards, which is what lets "no such lesson" and "not yours" be
  // told apart -- under RLS a student cannot see a paid item they have not
  // bought, so both would otherwise look identical.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser()

  if (userError || !user) {
    return json(req, { error: 'Not signed in.' }, 401)
  }

  const { data: student } = await service
    .from('students')
    .select('id, full_name, phone')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!student) {
    return json(req, { error: 'Not a student account.' }, 403)
  }

  const { data: item } = await service
    .from('content_items')
    .select(
      'id, status, file_url, video_provider, bunny_video_guid, video_status, video_thumbnail_url, video_resolutions, duration_seconds, poster_url'
    )
    .eq('id', contentItemId)
    .maybeSingle()

  if (!item || item.status !== 'published') {
    return json(req, { error: 'Not found.' }, 404)
  }

  const { data: entitlements, error: entitlementError } = await caller.rpc(
    'check_offline_entitlements',
    { p_content_item_id: contentItemId }
  )

  if (entitlementError) {
    console.error('[video-playback-token] entitlement check failed', entitlementError)
    return json(req, { error: 'This video is temporarily unavailable.' }, 502)
  }

  const entitlement = entitlements?.[0]
  if (!entitlement) {
    return json(req, { error: 'This content requires an active enrolment.' }, 403)
  }

  // Asking to download something the admin has not made available offline is
  // refused here rather than quietly served, so the app cannot end up holding
  // a copy of something it was never offered.
  if (forDownload && entitlement.is_downloadable !== true) {
    return json(req, { error: 'This lesson is not available offline.' }, 403)
  }

  const ttl = forDownload ? DOWNLOAD_TTL_SECONDS : STREAM_TTL_SECONDS

  // The app anchors every offline licence to this rather than to its own
  // clock. A licence measured by the device's clock is one the student renews
  // in their date settings: buy a month, download the course, set the phone
  // back a year, stay in airplane mode.
  const serverNow = new Date()
  const expiresAt = new Date(serverNow.getTime() + ttl * 1000).toISOString()

  // Who is watching, for the player to draw over the video.
  //
  // Returned for a download as well as a stream: an offline copy is the one
  // most worth marking, and the app has no second chance to ask once the
  // handset is in airplane mode.
  //
  // Never burned into the file -- that would be one encode per student, which
  // is a bill and a queue for a deterrent a screen recording beats anyway.
  // What it buys is a leaked recording that can be traced back.
  let watermark: { name: string; phone: string | null } | null = null

  const { data: watermarkSetting } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'watermark_enabled')
    .maybeSingle()

  // Defaults on, like the website's reader: a watermark that quietly stops
  // appearing is a leak, whereas one that appears when it was meant to be off
  // is a cosmetic complaint.
  const watermarkEnabled = watermarkSetting?.value !== false

  if (watermarkEnabled && student.full_name) {
    watermark = { name: student.full_name, phone: student.phone ?? null }
  }

  let hls: string | null = null
  let mp4: Record<string, string> = {}
  let thumbnail: string | null = null

  if (item.video_provider === 'bunny') {
    if (!item.bunny_video_guid || !BUNNY_CDN_HOSTNAME || !BUNNY_TOKEN_KEY) {
      return json(req, { error: 'This video is temporarily unavailable.' }, 502)
    }
    if (item.video_status !== 'ready') {
      return json(
        req,
        { error: 'This video is still being processed.', status: item.video_status },
        409
      )
    }

    mp4 = await signMp4Map(item.bunny_video_guid, item.video_resolutions ?? [], ttl)

    if (forDownload && Object.keys(mp4).length === 0) {
      // MP4 fallback is off in the library. Nothing to download, and saying so
      // beats handing back an empty map the app has to guess about.
      return json(
        req,
        { error: 'This lesson cannot be downloaded yet. Please try again later.' },
        409
      )
    }

    if (!forDownload) {
      hls = await signHls(item.bunny_video_guid, ttl)
      // The admin's poster lives in a public bucket, so it needs no signing
      // and no refresh. Bunny's auto-picked frame is the fallback.
      thumbnail = item.poster_url
        ? item.poster_url
        : item.video_thumbnail_url
          ? await signExisting(item.video_thumbnail_url, ttl)
          : null
    }
  } else if (item.video_provider === 'external' && item.file_url) {
    if (forDownload) {
      return json(req, { error: 'This lesson is not available offline.' }, 403)
    }
    // Someone else's hosting, with no renditions and nothing we can sign.
    hls = item.file_url
    thumbnail = item.poster_url ?? null
  } else {
    return json(req, { error: 'This lesson has no video yet.' }, 404)
  }

  if (forDownload) {
    // Bookkeeping, not a gate. A failure here must not stop a student who has
    // paid from getting their lesson, so it is logged rather than returned.
    const { error: recordError } = await service.from('content_downloads').upsert(
      {
        student_id: student.id,
        content_item_id: contentItemId,
        device_id: body.deviceId,
        quality: body.quality ?? null,
        downloaded_at: serverNow.toISOString(),
        last_verified_at: serverNow.toISOString(),
      },
      { onConflict: 'student_id,content_item_id,device_id' }
    )

    if (recordError) {
      console.error('[video-playback-token] download not recorded', recordError)
    }
  }

  return json(req, {
    provider: item.video_provider,
    hls,
    mp4,
    thumbnail,
    watermark,
    durationSeconds: item.duration_seconds,
    isDownloadable: entitlement.is_downloadable,
    offlineLicenseDays: entitlement.offline_license_days,
    validUntil: entitlement.valid_until,
    expiresAt,
    serverNow: serverNow.toISOString(),
  })
})
