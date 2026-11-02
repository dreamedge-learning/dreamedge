// A build error, not a convention. Importing this from anything that reaches
// the browser now fails the build by name, which is a far better outcome than
// the argument below -- that one explains why a leak would be harmless, and
// relies on every future reader reaching the same conclusion.
import "server-only";

import { createHash, createHmac } from "node:crypto";

/**
 * Bunny Stream: video hosting, resumable uploads and signed playback.
 *
 * This module is server-only, and the `server-only` import above is what makes
 * that true: a client component that imports it does not render a leaked key,
 * it fails to compile.
 *
 * The weaker guarantee is still worth knowing, because it is what kept this
 * safe before: Next inlines an environment variable into a client bundle only
 * when its name starts with NEXT_PUBLIC_, and none of the four below do, so in
 * a browser they would all read as undefined, `isBunnyConfigured()` would
 * report false, and there is no branch here that can produce a signature
 * without them.
 *
 * Two different secrets are at work and they are not interchangeable:
 *
 *   BUNNY_STREAM_API_KEY    the library's API key. Authorises the management
 *                           API -- create, read and delete a video -- and is
 *                           also hashed into the TUS upload signature.
 *   BUNNY_STREAM_TOKEN_KEY  the pull zone's URL token authentication key, from
 *                           CDN -> the Stream pull zone -> Security. This is
 *                           what signs a playback URL. It is NOT the library's
 *                           "embed view token" key, which signs iframe URLs we
 *                           do not use.
 */

const API_BASE = "https://video.bunnycdn.com";
const TUS_ENDPOINT = `${API_BASE}/tusupload`;

interface BunnyConfig {
  apiKey: string;
  libraryId: string;
  cdnHostname: string;
  tokenKey: string;
}

/** The Bunny video states we care about, flattened from Bunny's numeric enum. */
export type BunnyVideoStatus = "processing" | "ready" | "failed";

export interface BunnyVideo {
  guid: string;
  title: string;
  status: BunnyVideoStatus;
  /** Duration in seconds. 0 until transcoding has looked at the file. */
  lengthSeconds: number;
  /** Resolution labels Bunny has finished encoding, e.g. ["360p", "720p"]. */
  resolutions: string[];
  /** Whether Bunny produced the per-resolution MP4 files. */
  hasMp4Fallback: boolean;
  storageSizeBytes: number;
  thumbnailFileName: string | null;
  encodeProgress: number;
}

export interface TusTicket {
  videoGuid: string;
  libraryId: string;
  endpoint: string;
  expire: number;
  signature: string;
}

function readConfig(): BunnyConfig | null {
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY;

  if (!apiKey || !libraryId || !cdnHostname || !tokenKey) return null;

  // A pasted hostname often arrives with a scheme or a trailing slash on it.
  const host = cdnHostname.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!host) return null;

  return { apiKey, libraryId, cdnHostname: host, tokenKey };
}

/**
 * Whether video hosting is wired up.
 *
 * The panel asks this before it offers to upload anything, so that a developer
 * running without the Bunny variables gets a panel that says so rather than a
 * drop zone that fails on the first file.
 */
export function isBunnyConfigured(): boolean {
  return readConfig() !== null;
}

function requireConfig(): BunnyConfig {
  const config = readConfig();
  if (!config) {
    throw new Error("Video hosting is not configured.");
  }
  return config;
}

/**
 * Bunny's numeric status, reduced to the three states the panel distinguishes.
 *
 * 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error,
 * 6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated.
 *
 * 8 counts as ready: with just-in-time encoding the playlists exist and the
 * video plays, even though Bunny never moves it to 4. Anything that is not
 * finished or broken is "processing", including 0, which is a video object
 * whose bytes have not arrived yet.
 */
function mapStatus(status: number): BunnyVideoStatus {
  if (status === 4 || status === 8) return "ready";
  if (status === 5 || status === 6) return "failed";
  return "processing";
}

function toVideo(payload: Record<string, unknown>): BunnyVideo {
  const resolutions = String(payload.availableResolutions ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    guid: String(payload.guid ?? ""),
    title: String(payload.title ?? ""),
    status: mapStatus(Number(payload.status ?? 0)),
    lengthSeconds: Number(payload.length ?? 0),
    resolutions,
    hasMp4Fallback: payload.hasMP4Fallback === true,
    storageSizeBytes: Number(payload.storageSize ?? 0),
    thumbnailFileName:
      typeof payload.thumbnailFileName === "string" && payload.thumbnailFileName
        ? payload.thumbnailFileName
        : null,
    encodeProgress: Number(payload.encodeProgress ?? 0),
  };
}

async function callApi(
  path: string,
  init: RequestInit & { method: string }
): Promise<Record<string, unknown> | null> {
  const { apiKey, libraryId } = requireConfig();

  const response = await fetch(`${API_BASE}/library/${libraryId}${path}`, {
    ...init,
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    // Bunny's answer is the current state of a video and changes while a file
    // transcodes, so nothing here may be served from a cache.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bunny ${init.method} ${path} failed (${response.status})`);
  }

  // DELETE answers with a status envelope, not a video.
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Reserves a video object so a file has somewhere to go.
 *
 * Bunny's TUS upload uploads *into* an existing video, so this has to happen
 * before the browser sends a byte, and it is the only step that needs the API
 * key. The returned GUID is what every later call is keyed on.
 */
export async function createVideo(title: string): Promise<BunnyVideo> {
  const payload = await callApi("/videos", {
    method: "POST",
    body: JSON.stringify({ title: title.slice(0, 200) || "Untitled video" }),
  });

  if (!payload) throw new Error("Bunny returned no video.");
  return toVideo(payload);
}

export async function getVideo(guid: string): Promise<BunnyVideo> {
  const payload = await callApi(`/videos/${encodeURIComponent(guid)}`, {
    method: "GET",
  });

  if (!payload) throw new Error("Bunny returned no video.");
  return toVideo(payload);
}

export async function deleteVideo(guid: string): Promise<void> {
  await callApi(`/videos/${encodeURIComponent(guid)}`, { method: "DELETE" });
}

/**
 * Signs a resumable upload the browser then performs directly against Bunny.
 *
 * The file never passes through our server: a 2 GB lecture could not survive
 * the request body limits, and proxying it would double the bandwidth bill for
 * no gain. What crosses to the browser is this signature, which authorises
 * writing to one video GUID and nothing else, and expires.
 *
 * Bunny checks `AuthorizationExpire` on every POST and HEAD, so the window has
 * to cover the whole upload rather than just its start -- a long upload on a
 * slow line would otherwise be rejected halfway through when it reconnects.
 * Six hours is the default and is enough for a 4 GB file on a poor connection.
 */
export function signTusUpload(guid: string, ttlSeconds = 60 * 60 * 6): TusTicket {
  const { apiKey, libraryId } = requireConfig();
  const expire = Math.floor(Date.now() / 1000) + ttlSeconds;

  const signature = createHash("sha256")
    .update(`${libraryId}${apiKey}${expire}${guid}`)
    .digest("hex");

  return {
    videoGuid: guid,
    libraryId,
    endpoint: TUS_ENDPOINT,
    expire,
    signature,
  };
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Signs a URL for the Stream pull zone, using Bunny's advanced token
 * authentication.
 *
 * The token is an HMAC-SHA256 over the path being authorised, the expiry and
 * the sorted token parameters, keyed with the pull zone's token key. The key
 * is the HMAC key, never part of the message.
 *
 * Two placements exist and the difference matters for HLS. In query mode the
 * token rides on the file's own URL, which authorises exactly that file. In
 * directory mode it sits in the path, before the file, and `token_path`
 * widens what it covers -- which is the only arrangement that works for a
 * playlist, because a player resolves segment URLs relative to the manifest
 * and would otherwise request every .ts file without a token and be refused.
 */
function signCdnUrl(
  pathname: string,
  expires: number,
  tokenPath?: string
): string {
  const { cdnHostname, tokenKey } = requireConfig();

  const params = tokenPath ? { token_path: tokenPath } : {};
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));

  const signaturePath = tokenPath ?? pathname;
  const signingData = entries.map(([k, v]) => `${k}=${v}`).join("&");
  const urlData = entries
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const token =
    "HS256-" +
    base64Url(
      createHmac("sha256", tokenKey)
        .update(signaturePath)
        .update(String(expires))
        .update(signingData)
        .digest()
    );

  const base = `https://${cdnHostname}`;
  const tail = urlData ? `&${urlData}` : "";

  return tokenPath
    ? `${base}/bcdn_token=${token}${tail}&expires=${expires}${pathname}`
    : `${base}${pathname}?token=${token}${tail}&expires=${expires}`;
}

/**
 * A playable, expiring HLS URL for one video.
 *
 * The token covers the whole `/{guid}/` directory so the manifest's segments
 * and its per-resolution child playlists are authorised along with it.
 */
export function signPlayback(guid: string, ttlSeconds: number): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signCdnUrl(`/${guid}/playlist.m3u8`, expires, `/${guid}/`);
}

/**
 * Signed URLs for the MP4 renditions Bunny produced, keyed by height.
 *
 * These are what an offline download uses. Reassembling an HLS ladder on a
 * phone is a great deal of fragile work for nothing the student would notice,
 * whereas one MP4 is a single file a resumable download can own.
 *
 * `resolutions` comes from Bunny rather than from a list here, because which
 * renditions exist depends on the library's settings and on the source file --
 * a 480p recording never produces a 1080p rendition. If MP4 fallback is off in
 * the library there are no such files at all and this is empty, which is why
 * the panel warns about it loudly.
 */
export function mp4RenditionUrls(
  guid: string,
  resolutions: string[],
  ttlSeconds: number
): Record<string, string> {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const urls: Record<string, string> = {};

  for (const label of resolutions) {
    const height = label.replace(/[^0-9]/g, "");
    if (!height) continue;
    urls[height] = signCdnUrl(`/${guid}/play_${height}p.mp4`, expires);
  }

  return urls;
}

/**
 * The unsigned, canonical URL of one of a video's files.
 *
 * This is the form worth storing. A signed URL carries an expiry, so writing
 * one into `video_thumbnail_url` would put a value in the database that stops
 * working a few hours later and looks like a broken image rather than an
 * expired credential. The signature is added when the URL is handed out.
 */
export function canonicalUrl(guid: string, fileName: string): string {
  const { cdnHostname } = requireConfig();
  return `https://${cdnHostname}/${guid}/${fileName}`;
}

/**
 * Re-signs a stored URL that points at our own pull zone.
 *
 * Anything else -- an external thumbnail, a link from before the Bunny move --
 * is returned untouched, because signing it with our key would only corrupt a
 * URL that was already fine.
 */
export function signExistingUrl(url: string, ttlSeconds: number): string {
  const config = readConfig();
  if (!config) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.host !== config.cdnHostname) return url;

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signCdnUrl(parsed.pathname, expires);
}
