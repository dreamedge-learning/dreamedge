import { NextResponse } from "next/server";

import { getStudent } from "@/lib/auth-student";
import {
  isBunnyConfigured,
  mp4RenditionUrls,
  signExistingUrl,
  signPlayback,
} from "@/lib/bunny";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Hands the player everything it needs to play one lesson.
 *
 * A hosted video is never a stored URL. Bunny serves it from a pull zone with
 * token authentication on, so the playable address is minted here, per
 * request, after the caller has been checked -- and it stops working shortly
 * afterwards. That is what makes a paid lesson unforwardable: the link in
 * somebody's clipboard is dead by the time it is pasted.
 *
 * Entitlement is not decided here. `check_offline_entitlements` is the one
 * definition of the paywall rule, shared with the Edge Function the app talks
 * to and with the app's own reconnect sweep, so a change to who has paid
 * cannot land in one of the three and not the others.
 */

// Six hours. The file route's ten minutes is right for a PDF, which is
// fetched once, but a 50-minute lesson that a student pauses over dinner must
// not come back to a dead URL -- and an HLS stream re-requests a segment every
// few seconds for its whole length.
const PLAYBACK_TTL_SECONDS = 60 * 60 * 6;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const student = await getStudent();
  if (!student) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Read the row with the service role, so that "this lesson does not exist"
  // and "this lesson is not yours" can be told apart. Under RLS a student
  // simply cannot see a paid item they have not bought, which would turn
  // every paywall hit into a 404 and leave the app unable to say why.
  const service = createServiceClient();
  const { data: item } = await service
    .from("content_items")
    .select(
      "id, status, type, file_url, video_provider, bunny_video_guid, video_status, video_thumbnail_url, video_resolutions, duration_seconds"
    )
    .eq("id", id)
    .maybeSingle();

  if (!item || item.status !== "published") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: entitlements, error: entitlementError } = await supabase.rpc(
    "check_offline_entitlements",
    { p_content_item_id: id }
  );

  if (entitlementError) {
    console.error("[content video] entitlement check failed", entitlementError);
    return NextResponse.json(
      { error: "This video is temporarily unavailable." },
      { status: 502 }
    );
  }

  const entitlement = entitlements?.[0];
  if (!entitlement) {
    return NextResponse.json(
      { error: "This content requires an active enrolment." },
      { status: 403 }
    );
  }

  const expiresAt = new Date(
    Date.now() + PLAYBACK_TTL_SECONDS * 1000
  ).toISOString();

  const body = {
    provider: item.video_provider,
    hls: null as string | null,
    mp4: {} as Record<string, string>,
    thumbnail: null as string | null,
    durationSeconds: item.duration_seconds,
    isDownloadable: entitlement.is_downloadable,
    offlineLicenseDays: entitlement.offline_license_days,
    expiresAt,
  };

  if (item.video_provider === "bunny") {
    if (!item.bunny_video_guid || !isBunnyConfigured()) {
      return NextResponse.json(
        { error: "This video is temporarily unavailable." },
        { status: 502 }
      );
    }
    if (item.video_status !== "ready") {
      // Honest about the reason: the player can say "still processing" rather
      // than showing a retry button for something retrying will not fix.
      return NextResponse.json(
        { error: "This video is still being processed.", status: item.video_status },
        { status: 409 }
      );
    }

    body.hls = signPlayback(item.bunny_video_guid, PLAYBACK_TTL_SECONDS);
    body.mp4 = mp4RenditionUrls(
      item.bunny_video_guid,
      item.video_resolutions,
      PLAYBACK_TTL_SECONDS
    );
    body.thumbnail = item.video_thumbnail_url
      ? signExistingUrl(item.video_thumbnail_url, PLAYBACK_TTL_SECONDS)
      : null;
  } else if (item.video_provider === "external" && item.file_url) {
    // Someone else's hosting, someone else's rules. It goes back untouched,
    // with no renditions, because there are none to offer and nothing we can
    // sign.
    body.hls = item.file_url;
  } else {
    return NextResponse.json(
      { error: "This lesson has no video yet." },
      { status: 404 }
    );
  }

  // The body carries credentials with a short life. A cached copy would
  // outlive the entitlement check that produced it, and a shared cache would
  // hand one student's token to the next.
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, private" },
  });
}
