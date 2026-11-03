"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import {
  canonicalUrl,
  createVideo,
  deleteVideo,
  getVideo,
  isBunnyConfigured,
  signExistingUrl,
  signPlayback,
  signTusUpload,
  type TusTicket,
} from "@/lib/bunny";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase";
import { describeFailure, firstIssue, uuid } from "@/lib/validations/form";

type ContentItemUpdate =
  Database["public"]["Tables"]["content_items"]["Update"];

// Bunny takes files far larger than this; the cap is ours. A lesson past 4 GB
// is a recording nobody trimmed, and it costs storage and delivery on every
// student who ever opens it.
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

// Long enough to watch a take through, short enough that the link is dead
// before it could be passed on.
const PREVIEW_TTL_SECONDS = 60 * 10;

// Long enough that the thumbnail is still loading when the admin looks at it,
// short enough that a copied panel URL is not a shareable video link.
const ADMIN_THUMBNAIL_TTL_SECONDS = 60 * 60;

/**
 * Where the GUID of an upload still in flight is kept.
 *
 * It cannot go straight into `bunny_video_guid`, because that column is what
 * students play from. Writing a half-uploaded video's GUID there would take a
 * published lesson dark for the hours a replacement takes to arrive and
 * transcode. So an upload is staged in `metadata` and `attachBunnyVideo`
 * promotes it once the bytes have all landed; until then the lesson keeps
 * playing exactly what it played before.
 *
 * It also survives a reload, which is what lets a resumed upload re-sign the
 * same GUID instead of starting a 2 GB file over.
 */
const PENDING_KEY = "pending_video_guid";

export interface VideoState {
  provider: string;
  videoGuid: string | null;
  status: string;
  /** Signed for display in the panel; not stored in this form. */
  thumbnailUrl: string | null;
  resolutions: string[];
  sizeBytes: number | null;
  durationSeconds: number | null;
  encodeProgress: number;
  /** Something the admin must act on, or null when all is well. */
  warning: string | null;
}

type Metadata = { [key: string]: Json | undefined };

function asMetadata(value: unknown): Metadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Metadata) }
    : {};
}

function pendingGuid(metadata: unknown): string | null {
  const value = asMetadata(metadata)[PENDING_KEY];
  return typeof value === "string" && value ? value : null;
}

/**
 * Whether the panel may offer to upload a video at all.
 *
 * Without the Bunny variables the uploader renders a disabled state instead of
 * a drop zone that would fail on the first file, and the external-URL path
 * keeps working so a lesson can still be wired up.
 */
export async function getVideoHostingStatus() {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    return { data: { configured: isBunnyConfigured() } };
  } catch (err) {
    console.error("getVideoHostingStatus failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Authorises a resumable upload for one content item.
 *
 * The file never passes through this server -- a 4 GB lecture could not
 * survive the request body limits, and proxying it would double the bandwidth
 * bill for nothing. What crosses to the browser is a signature that authorises
 * writing to one video GUID and expires. The API key is not in the response
 * and must never be.
 *
 * Asked a second time for an item whose staged upload has not finished
 * transcoding, this re-signs that same GUID. That is what makes resuming
 * after a reload continue rather than restart.
 */
export async function createVideoUploadTicket(
  contentItemId: string,
  fileName: string,
  sizeBytes: number
): Promise<{ data?: TusTicket; error?: string }> {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    if (!isBunnyConfigured()) {
      return { error: "Video hosting is not configured yet." };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { error: "That file looks empty." };
    }
    if (sizeBytes > MAX_VIDEO_BYTES) {
      return { error: "Video must be under 4 GB." };
    }

    const { data: item, error: findError } = await supabase
      .from("content_items")
      .select("id, title, metadata")
      .eq("id", parsed.data)
      .single();

    if (findError || !item) {
      return { error: "That content item no longer exists." };
    }

    const staged = pendingGuid(item.metadata);
    if (staged) {
      // Reuse only while it is unfinished. A staged video that has transcoded
      // was already attached, or is a leftover worth replacing.
      const existing = await getVideo(staged).catch(() => null);
      if (existing && existing.status !== "ready") {
        return { data: signTusUpload(existing.guid) };
      }
    }

    const created = await createVideo(
      `${item.title} — ${fileName}`.slice(0, 200)
    );

    const { error: stageError } = await supabase
      .from("content_items")
      .update({
        metadata: { ...asMetadata(item.metadata), [PENDING_KEY]: created.guid },
      })
      .eq("id", parsed.data);

    if (stageError) {
      console.error("createVideoUploadTicket failed:", stageError);
      // Nothing of ours points at the video now, and an unreferenced video is
      // billed storage nobody can find again.
      await deleteVideo(created.guid).catch((err) =>
        console.error("createVideoUploadTicket: orphan left on Bunny", err)
      );
      return { error: "Could not start the upload. Please try again." };
    }

    return { data: signTusUpload(created.guid) };
  } catch (err) {
    console.error("createVideoUploadTicket failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Promotes a finished upload to be the item's video.
 *
 * `file_url` is cleared because the two are alternatives, not a fallback pair:
 * a row holding both would leave "which one plays" to whichever bit of code
 * looked first. The thumbnail and resolutions go too -- they describe the
 * video being replaced, and showing them beside a different film is worse
 * than showing nothing until the refresh fills them in.
 */
export async function attachBunnyVideo(
  contentItemId: string,
  videoGuid: string,
  sizeBytes: number
) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: item } = await supabase
      .from("content_items")
      .select("id, bunny_video_guid, metadata")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!item) return { error: "That content item no longer exists." };

    // The GUID arrives from the browser, so it is checked against the one this
    // item was issued a ticket for. Otherwise an admin could point a lesson at
    // any video in the library by passing its id.
    if (pendingGuid(item.metadata) !== videoGuid) {
      return { error: "That upload does not belong to this item." };
    }

    const metadata = asMetadata(item.metadata);
    delete metadata[PENDING_KEY];

    const replaced =
      item.bunny_video_guid && item.bunny_video_guid !== videoGuid
        ? item.bunny_video_guid
        : null;

    const { data, error } = await supabase
      .from("content_items")
      .update({
        video_provider: "bunny",
        video_status: "processing",
        bunny_video_guid: videoGuid,
        video_size_bytes: Math.max(0, Math.round(sizeBytes)) || null,
        video_thumbnail_url: null,
        video_resolutions: [],
        file_url: null,
        metadata,
      })
      .eq("id", parsed.data)
      .select()
      .single();

    if (error) {
      console.error("attachBunnyVideo failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    // Only once the row points at the new video, or a failure above would have
    // left the lesson pointing at something deleted.
    if (replaced && isBunnyConfigured()) {
      await deleteVideo(replaced).catch((err) =>
        console.error("attachBunnyVideo: replaced video left on Bunny", err)
      );
    }

    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("attachBunnyVideo failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Throws away an upload that was abandoned, leaving the live video alone.
 *
 * This is what "cancel" means while a replacement is in flight: the lesson
 * goes on playing what it played before, and the half-uploaded file stops
 * being billed.
 */
export async function discardPendingVideo(contentItemId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: item } = await supabase
      .from("content_items")
      .select("id, metadata")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!item) return { success: true };

    const staged = pendingGuid(item.metadata);
    if (!staged) return { success: true };

    const metadata = asMetadata(item.metadata);
    delete metadata[PENDING_KEY];

    const { error } = await supabase
      .from("content_items")
      .update({ metadata })
      .eq("id", parsed.data);

    if (error) {
      console.error("discardPendingVideo failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    if (isBunnyConfigured()) {
      await deleteVideo(staged).catch((err) =>
        console.error("discardPendingVideo: video left on Bunny", err)
      );
    }

    return { success: true };
  } catch (err) {
    console.error("discardPendingVideo failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Asks Bunny where the transcode has got to and stores the answer.
 *
 * The video columns on our side are a cache of Bunny's state, kept so that
 * rendering a lesson -- in the panel or in the app -- never waits on a third
 * party. This is the only place that cache is written.
 *
 * The MP4 warning is the one failure that looks like success. A library with
 * MP4 fallback switched off transcodes happily and streams happily, and then
 * offline download has no file to fetch and the quality menu has nothing to
 * offer. It has to be said out loud where someone can fix it.
 */
export async function refreshVideoStatus(
  contentItemId: string
): Promise<{ data?: VideoState; error?: string }> {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: item } = await supabase
      .from("content_items")
      .select(
        "id, video_provider, bunny_video_guid, video_status, video_thumbnail_url, video_resolutions, video_size_bytes, duration_seconds"
      )
      .eq("id", parsed.data)
      .maybeSingle();

    if (!item) return { error: "That content item no longer exists." };

    const stored: VideoState = {
      provider: item.video_provider,
      videoGuid: item.bunny_video_guid,
      status: item.video_status,
      thumbnailUrl: item.video_thumbnail_url
        ? signExistingUrl(item.video_thumbnail_url, ADMIN_THUMBNAIL_TTL_SECONDS)
        : null,
      resolutions: item.video_resolutions,
      sizeBytes: item.video_size_bytes,
      durationSeconds: item.duration_seconds,
      encodeProgress: item.video_status === "ready" ? 100 : 0,
      warning: null,
    };

    // An external video has no transcode to ask about, and without the Bunny
    // variables there is nobody to ask.
    if (!item.bunny_video_guid || !isBunnyConfigured()) {
      return { data: stored };
    }

    const video = await getVideo(item.bunny_video_guid);

    const update: ContentItemUpdate = { video_status: video.status };

    if (video.status === "ready") {
      update.video_resolutions = video.resolutions;
      update.video_size_bytes = video.storageSizeBytes || item.video_size_bytes;

      // Bunny measured this from the file. A measured duration beats one an
      // admin typed, which is why it overwrites rather than fills a blank.
      if (video.lengthSeconds > 0) update.duration_seconds = video.lengthSeconds;

      if (video.thumbnailFileName) {
        update.video_thumbnail_url = canonicalUrl(
          video.guid,
          video.thumbnailFileName
        );
      }
    }

    const { error } = await supabase
      .from("content_items")
      .update(update)
      .eq("id", parsed.data);

    if (error) {
      console.error("refreshVideoStatus failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    let warning: string | null = null;
    if (video.status === "ready" && !video.hasMp4Fallback) {
      warning =
        "MP4 fallback is off in the Bunny library — offline download and manual quality will not work for this video.";
    } else if (video.status === "failed") {
      warning =
        "Bunny could not transcode this file. Re-upload it, or convert it to MP4 first.";
    }

    const thumbnailUrl =
      update.video_thumbnail_url ?? item.video_thumbnail_url;

    revalidatePath("/admin/content/manager");

    return {
      data: {
        ...stored,
        videoGuid: video.guid,
        status: video.status,
        thumbnailUrl: thumbnailUrl
          ? signExistingUrl(thumbnailUrl, ADMIN_THUMBNAIL_TTL_SECONDS)
          : null,
        resolutions:
          video.status === "ready" ? video.resolutions : item.video_resolutions,
        sizeBytes: update.video_size_bytes ?? item.video_size_bytes,
        durationSeconds: update.duration_seconds ?? item.duration_seconds,
        encodeProgress: video.encodeProgress,
        warning,
      },
    };
  } catch (err) {
    console.error("refreshVideoStatus failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Points a lesson at a video hosted somewhere else.
 *
 * Kept for recordings that already live on a URL and for anything not moved
 * across yet. Such a video cannot be quality-switched or taken offline,
 * because neither renditions nor a playback token exist for it.
 */
export async function setExternalVideoUrl(contentItemId: string, url: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const trimmed = url.trim();
    if (!trimmed) return { error: "Enter a video URL." };
    if (trimmed.length > 2000) return { error: "That URL is too long." };
    if (!/^https:\/\//i.test(trimmed)) {
      return { error: "The URL must start with https://" };
    }

    const { data: item } = await supabase
      .from("content_items")
      .select("id, bunny_video_guid, metadata")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!item) return { error: "That content item no longer exists." };

    const metadata = asMetadata(item.metadata);
    delete metadata[PENDING_KEY];

    const { data, error } = await supabase
      .from("content_items")
      .update({
        video_provider: "external",
        video_status: "ready",
        file_url: trimmed,
        // None of these describe an external video, and leaving a previous
        // upload's values behind would show its thumbnail beside someone
        // else's film.
        bunny_video_guid: null,
        video_thumbnail_url: null,
        video_resolutions: [],
        video_size_bytes: null,
        metadata,
      })
      .eq("id", parsed.data)
      .select()
      .single();

    if (error) {
      console.error("setExternalVideoUrl failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    if (isBunnyConfigured()) {
      for (const guid of [item.bunny_video_guid, pendingGuid(item.metadata)]) {
        if (!guid) continue;
        await deleteVideo(guid).catch((err) =>
          console.error("setExternalVideoUrl: video left on Bunny", err)
        );
      }
    }

    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("setExternalVideoUrl failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * Detaches the video and deletes it from Bunny.
 *
 * The row is cleared first. If Bunny's delete then fails we are left paying
 * for a file nobody can reach, which costs money; clearing second would risk
 * a row pointing at a video that no longer exists, which costs a student
 * their lesson.
 */
export async function removeVideo(contentItemId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const { data: item } = await supabase
      .from("content_items")
      .select("id, bunny_video_guid, metadata")
      .eq("id", parsed.data)
      .maybeSingle();

    if (!item) return { error: "That content item no longer exists." };

    const metadata = asMetadata(item.metadata);
    delete metadata[PENDING_KEY];

    const { data, error } = await supabase
      .from("content_items")
      .update({
        video_provider: "none",
        video_status: "none",
        bunny_video_guid: null,
        video_thumbnail_url: null,
        video_resolutions: [],
        video_size_bytes: null,
        file_url: null,
        metadata,
      })
      .eq("id", parsed.data)
      .select()
      .single();

    if (error) {
      console.error("removeVideo failed:", error);
      return { error: "Something went wrong. Please try again." };
    }

    if (isBunnyConfigured()) {
      for (const guid of [item.bunny_video_guid, pendingGuid(item.metadata)]) {
        if (!guid) continue;
        await deleteVideo(guid).catch((err) =>
          console.error("removeVideo: video left on Bunny", err)
        );
      }
    }

    revalidatePath("/admin/content/manager");
    return { data };
  } catch (err) {
    console.error("removeVideo failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * A short-lived playback URL so an admin can watch the lesson before publishing.
 *
 * Deliberately not the student route: that one answers to
 * `check_offline_entitlements`, and an admin has bought nothing. It is also
 * deliberately not a longer-lived URL than it needs to be -- ten minutes is
 * enough to check a take, and a preview link that outlives the review is a
 * paid lesson sitting unprotected in somebody's history.
 *
 * `register_content_play` is not called: a review is not a play, and counting
 * it would spend a student-facing play limit the admin does not own.
 */
export async function getVideoPreviewUrl(contentItemId: string) {
  try {
    await assertAdmin(["super_admin", "content_creator"]);
    const supabase = await createClient();

    const parsed = uuid("Content item").safeParse(contentItemId);
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    if (!isBunnyConfigured()) {
      return { error: "Video hosting is not configured yet." };
    }

    const { data: item, error } = await supabase
      .from("content_items")
      .select("bunny_video_guid, video_provider, video_status")
      .eq("id", parsed.data)
      .single();

    if (error || !item) return { error: "That content item no longer exists." };

    if (item.video_provider !== "bunny" || !item.bunny_video_guid) {
      return { error: "There is no hosted video on this lesson." };
    }

    if (item.video_status !== "ready") {
      return { error: "Bunny is still processing this video." };
    }

    return {
      data: { url: signPlayback(item.bunny_video_guid, PREVIEW_TTL_SECONDS) },
    };
  } catch (err) {
    console.error("getVideoPreviewUrl failed:", err);
    return { error: describeFailure(err) };
  }
}
