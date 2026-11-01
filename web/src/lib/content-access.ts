import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

/**
 * Who is asking for a piece of content, and whether they may have it.
 *
 * Two surfaces reach these routes and they authenticate differently. The
 * website has a session cookie. The Flutter app has a Supabase access token
 * and no cookie at all, because it never talks to this domain for anything
 * else -- so a cookie-only route is a route the app cannot use, which is why
 * the bearer path exists.
 *
 * Both end up at the same place: a student id and a Supabase client carrying
 * that student's identity, so the entitlement RPC resolves to them and cannot
 * be talked into answering about somebody else.
 */

export interface StudentRequest {
  studentId: string;
  supabase: SupabaseClient<Database>;
}

export interface ContentEntitlement {
  contentItemId: string;
  courseId: string;
  validUntil: string | null;
  offlineLicenseDays: number;
  isDownloadable: boolean;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/** A client that acts as the holder of `token`, with no cookie involvement. */
function clientForToken(token: string): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

/**
 * Resolves the caller to a student, from a bearer token or a session cookie.
 *
 * Returns null when there is no signed-in student, which the caller turns into
 * a 401. An authenticated user who is not a student is also null: an admin
 * account has no enrolments and nothing here would be true of it.
 */
export async function authenticateStudent(
  request: Request
): Promise<StudentRequest | null> {
  const token = bearerToken(request);
  const supabase = token ? clientForToken(token) : await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!student) return null;
  return { studentId: student.id, supabase };
}

/**
 * Whether this student may have this content item, and on what terms.
 *
 * The rule is not here. `check_offline_entitlements` is the one definition of
 * it, shared with the Edge Function the app talks to and the app's reconnect
 * sweep, so a change to who has paid cannot land in one place and not the
 * others. Null means not entitled.
 */
export async function contentEntitlement(
  { supabase }: StudentRequest,
  contentItemId: string
): Promise<ContentEntitlement | null> {
  const { data, error } = await supabase.rpc("check_offline_entitlements", {
    p_content_item_id: contentItemId,
  });

  if (error) {
    // Thrown rather than returned as "not entitled": a database that cannot
    // answer is a 502, and quietly reporting a paywall hit would tell a
    // paying student they had not paid.
    throw error;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    contentItemId: row.content_item_id,
    courseId: row.course_id,
    validUntil: row.valid_until,
    offlineLicenseDays: row.offline_license_days,
    isDownloadable: row.is_downloadable,
  };
}
