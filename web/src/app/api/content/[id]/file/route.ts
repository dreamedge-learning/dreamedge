import { NextResponse } from "next/server";

import { getStudent } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Serves a protected content file.
 *
 * `content-files` is a private bucket, so nothing in it is reachable by URL.
 * This route is the only way in: it checks that the caller is a student with a
 * live enrolment in the course the file belongs to, then mints a signed URL
 * that expires shortly after and redirects to it.
 *
 * Doing the check here rather than relying on bucket policy is deliberate.
 * Entitlement lives in `enrollments` -- course, status and expiry -- and
 * storage policies cannot see the content item the object belongs to without
 * duplicating the whole subject/topic join into a storage policy.
 *
 * An item may carry several files. `?f=<id>` picks one; without it the first
 * by weight is served, which is what the player embeds.
 *
 * The signed URL is deliberately short-lived. It can still be copied out of
 * the browser within its window, which is the normal ceiling for web-delivered
 * content; defeating a determined screen-recorder is a DRM problem and is what
 * the Mux move in Phase 2 is for.
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

  const student = await getStudent();
  if (!student) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  // The item, and the course it hangs off, in one hop:
  // content_items -> topics -> subjects -> course_id
  const { data: item } = await supabase
    .from("content_items")
    .select("id, file_url, is_paid, status, topics!inner(subjects!inner(course_id))")
    .eq("id", id)
    .single();

  if (!item || item.status !== "published") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const topic = item.topics as unknown as {
    subjects: { course_id: string } | null;
  } | null;
  const courseId = topic?.subjects?.course_id;

  if (!courseId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (item.is_paid) {
    // A renewal leaves a second active row for the same course, and
    // `maybeSingle` on two rows is an error, not a row -- which would lock a
    // paying student out. Take the longest-lived one; a null `valid_until`
    // never expires and so sorts first.
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, valid_until")
      .eq("student_id", student.id)
      .eq("course_id", courseId)
      .eq("status", "active")
      .order("valid_until", { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    const entitled =
      !!enrollment &&
      (!enrollment.valid_until ||
        new Date(enrollment.valid_until) > new Date());

    if (!entitled) {
      return NextResponse.json(
        { error: "This content requires an active enrolment." },
        { status: 403 }
      );
    }
  }

  // Scoped to the item either way, so `?f=` cannot reach a file belonging to
  // another lesson.
  let query = supabase
    .from("content_files")
    .select("id, storage_path, display_name")
    .eq("content_item_id", id);

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

  // Signing needs to bypass RLS on the bucket, so it runs with the service
  // role -- after the entitlement check above, never before it.
  const service = createServiceClient();
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

  // No-store: the redirect carries a credential with a short life, and a
  // cached copy would outlive the entitlement check that produced it.
  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "no-store, private" },
  });
}
