import { NextResponse } from "next/server";

import { authenticateStudent, contentEntitlement } from "@/lib/content-access";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Serves a protected content file.
 *
 * `content-files` is a private bucket, so nothing in it is reachable by URL.
 * This route is the only way in: it checks that the caller is a student
 * entitled to the item the file belongs to, then mints a signed URL that
 * expires shortly after and redirects to it.
 *
 * Doing the check here rather than relying on bucket policy is deliberate.
 * Entitlement lives in `enrollments` -- course, status and expiry -- and
 * storage policies cannot see the content item an object belongs to without
 * duplicating the whole subject/topic join into a storage policy.
 *
 * An item may carry several files. `?f=<id>` picks one; without it the first
 * by weight is served, which is what the player embeds.
 *
 * The signed URL is deliberately short-lived. It can still be copied out of
 * the browser within its window, which is the normal ceiling for
 * web-delivered content; defeating a determined screen-recorder is a DRM
 * problem and is what the Mux move in Phase 2 is for.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  // The player asks for an attachment when the student used the download
  // button. Anything else is served inline so the PDF viewer can embed it.
  const asAttachment = url.searchParams.get("download") === "1";
  const requestedFileId = url.searchParams.get("f");

  // The app names the device it is saving to. A downloaded booklet is a copy
  // that has left our reach, and a copy with no device recorded against it is
  // one support cannot see and a refund cannot revoke.
  const deviceId = url.searchParams.get("device");

  const caller = await authenticateStudent(request);
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Read the row with the service role, so that "this lesson does not exist"
  // and "this lesson is not yours" can be told apart. Under RLS a student
  // simply cannot see a paid item they have not bought, which would turn
  // every paywall hit into a 404 and leave the caller unable to say why.
  const service = createServiceClient();
  const { data: item } = await service
    .from("content_items")
    .select("id, status, file_url, is_printable")
    .eq("id", id)
    .maybeSingle();

  if (!item || item.status !== "published") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let entitlement;
  try {
    entitlement = await contentEntitlement(caller, id);
  } catch (error) {
    console.error("[content file] entitlement check failed", error);
    return NextResponse.json(
      { error: "This file is temporarily unavailable." },
      { status: 502 }
    );
  }

  if (!entitlement) {
    return NextResponse.json(
      { error: "This content requires an active enrolment." },
      { status: 403 }
    );
  }

  // Reading a document and keeping a copy of it are different permissions.
  //
  //   READ -- the student is opening the file inline, nothing survives the
  //           tab or the reader route. The website embeds a signed URL in an
  //           <object>, the app's PDF reader fetches the URL with `?json=1`
  //           and never saves it. Allowed for every entitled student.
  //
  //   COPY -- the student is about to walk away with the bytes. The website
  //           sets `?download=1` so the signed URL gets a Content-Disposition
  //           header, and the app's download manager sets `?device=<id>` so
  //           the file can be recorded against a device and later revoked.
  //           Allowed only when `is_downloadable` is on.
  //
  // The earlier shape ("`?json=1` means copy") merged the two because the app
  // happens to use JSON for both the reader and the downloader -- but the two
  // app paths are distinguishable by the device marker, and the website
  // reader does not go through this branch at all. Gate on intent, not on
  // response format: a reader without a device must open the file.
  //
  // The video path refuses the same way server-side
  // (video-playback-token/index.ts). Same rule, same status, same words.
  const isCopyRequest = asAttachment || deviceId !== null;
  if (isCopyRequest && !entitlement.isDownloadable) {
    return NextResponse.json(
      { error: "This lesson is not available offline." },
      { status: 403 }
    );
  }

  // Scoped to the item either way, so `?f=` cannot reach a file belonging to
  // another lesson.
  // The service client bypasses RLS, so the rule that students never receive
  // a PowerPoint or Word original has to be stated here too. Without it, a
  // lesson whose first attachment is the .pptx would hand that to a student,
  // and ?f= could name one directly.
  let query = service
    .from("content_files")
    .select("id, storage_path, display_name")
    .eq("content_item_id", id)
    .eq("is_source_document", false);

  query = requestedFileId
    ? query.eq("id", requestedFileId)
    : query.order("weight", { ascending: true }).order("created_at", {
        ascending: true,
      });

  const { data: file } = await query.limit(1).maybeSingle();

  if (!file) {
    // Nothing of ours to serve. A bare link on the item is an external
    // resource that was never in our bucket; hand it back untouched.
    if (!requestedFileId && item.file_url && /^https?:\/\//i.test(item.file_url)) {
      return NextResponse.redirect(item.file_url);
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: signed, error: signError } = await service.storage
    .from("content-files")
    .createSignedUrl(
      file.storage_path,
      SIGNED_URL_TTL_SECONDS,
      // Passing the name makes the browser save it as the admin titled it,
      // rather than as the random key the object is stored under.
      asAttachment ? { download: file.display_name } : undefined
    );

  if (signError || !signed?.signedUrl) {
    console.error("[content file] signing failed", signError);
    return NextResponse.json(
      { error: "This file is temporarily unavailable." },
      { status: 502 }
    );
  }

  const serverNow = new Date();

  // A copy must be auditable: a refund revokes against content_downloads and
  // support reads it to answer "did my booklet go anywhere?". The earlier
  // shape only wrote this row when the Dart app named a device, so a browser
  // download walked out of the bucket unrecorded. The web browser does not
  // have a stable device identity, so we attribute its downloads to the
  // student instead -- one row per student per item on the web side is still
  // one row more than silence, and the Dart `device_id` is unchanged.
  if (isCopyRequest) {
    const auditDeviceId = deviceId ?? `web:${caller.studentId}`;
    const { error: recordError } = await service
      .from("content_downloads")
      .upsert(
        {
          student_id: caller.studentId,
          content_item_id: id,
          device_id: auditDeviceId,
          quality: null,
          downloaded_at: serverNow.toISOString(),
          last_verified_at: serverNow.toISOString(),
        },
        { onConflict: "student_id,content_item_id,device_id" }
      );

    if (recordError) {
      // Logged, not returned: a paid student must not lose their file to a
      // bookkeeping failure. The same rule the Edge Function follows for
      // video.
      console.error("[content file] download not recorded", recordError);
    }
  }

  // A redirect is right for the browser, which follows it and streams the
  // object. It is wrong for the app: Dio would follow it too, but the app
  // needs the URL itself so a paused download can be resumed against it with
  // a Range header. `?json=1` asks for the address instead of the content --
  // the app's reader uses it too, which is why it must be allowed without a
  // device id (see the intent split above).
  if (url.searchParams.get("json") === "1") {
    return NextResponse.json(
      {
        url: signed.signedUrl,
        fileName: file.display_name,
        isDownloadable: entitlement.isDownloadable,
        offlineLicenseDays: entitlement.offlineLicenseDays,
        // The two the app could not get anywhere else, and without which a
        // downloaded PDF outlived the enrolment that paid for it: the
        // enrolment's own end date to cap the licence against, and the
        // server's clock to measure it from rather than the device's.
        validUntil: entitlement.validUntil,
        serverNow: serverNow.toISOString(),
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // No-store: the redirect carries a credential with a short life, and a
  // cached copy would outlive the entitlement check that produced it.
  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "no-store, private" },
  });
}
