import { NextResponse } from "next/server";

import { getStudent } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Serves a protected content file.
 *
 * `content-files` is a private bucket, so the stored `file_url` is an object
 * path rather than a link. This route is the only way to reach it: it checks
 * that the caller is a student with a live enrolment in the course the file
 * belongs to, then mints a signed URL that expires shortly after and redirects
 * to it.
 *
 * Doing the check here rather than relying on bucket policy is deliberate.
 * Entitlement lives in `enrollments` -- course, status and expiry -- and
 * storage policies cannot see the content item the object belongs to without
 * duplicating the whole subject/topic join into a storage policy.
 *
 * The signed URL is deliberately short-lived. It can still be copied out of
 * the browser within its window, which is the normal ceiling for web-delivered
 * content; defeating a determined screen-recorder is a DRM problem and is what
 * the Mux move in Phase 2 is for.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const student = await getStudent();
  if (!student) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  // The item, and the course it hangs off, in one hop:
  // content_items -> topics -> subjects -> course_id
  const { data: item } = await supabase
    .from("content_items")
    .select(
      "id, file_url, is_paid, status, topics!inner(subjects!inner(course_id))"
    )
    .eq("id", id)
    .single();

  if (!item || item.status !== "published" || !item.file_url) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // A value with a scheme is an external resource (Bunny.net and the like)
  // and was never in our bucket; hand it back untouched.
  if (/^https?:\/\//i.test(item.file_url)) {
    return NextResponse.redirect(item.file_url);
  }

  const topic = item.topics as unknown as {
    subjects: { course_id: string } | null;
  } | null;
  const courseId = topic?.subjects?.course_id;

  if (!courseId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (item.is_paid) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, valid_until")
      .eq("student_id", student.id)
      .eq("course_id", courseId)
      .eq("status", "active")
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

  // Signing needs to bypass RLS on the bucket, so it runs with the service
  // role -- after the entitlement check above, never before it.
  const service = createServiceClient();
  const { data: signed, error: signError } = await service.storage
    .from("content-files")
    .createSignedUrl(item.file_url, SIGNED_URL_TTL_SECONDS);

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
