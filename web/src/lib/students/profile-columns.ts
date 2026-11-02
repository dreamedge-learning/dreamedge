import { normalizeIndianPhone } from "@/lib/phone";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/supabase";

/**
 * Turning validated profile values into a `students` update.
 *
 * Shared by the onboarding form, the profile editor on the dashboard and the
 * admin's offline registration form, because all three collect the same
 * fields and all three have to write them the same way. The alternative is
 * three slightly different ideas of what "blank" means.
 */

export type StudentUpdate = Database["public"]["Tables"]["students"]["Update"];

/**
 * Only the keys present in `values` are written.
 *
 * That is what makes a per-step autosave safe: saving step 2 must not blank
 * the fields of a step the student has not reached yet.
 *
 * Phone numbers are normalised here rather than in the schema, so the student
 * keeps seeing the ten digits they typed while the column holds the E.164
 * form that Supabase auth and the admin's search both key on.
 */
export function profileColumns(values: Record<string, unknown>): StudentUpdate {
  const text = (key: string): string | null => {
    const value = values[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };

  const phone = (key: string): string | null => {
    const value = values[key];
    return typeof value === "string" ? normalizeIndianPhone(value) : null;
  };

  const columns: StudentUpdate = {};

  // `full_name` is NOT NULL and required by the schema, so a null here could
  // only be an autosave about to wipe the name Google gave us.
  const fullName = text("full_name");
  if ("full_name" in values && fullName !== null) columns.full_name = fullName;

  if ("date_of_birth" in values) columns.date_of_birth = text("date_of_birth");
  if ("gender" in values) columns.gender = text("gender");
  if ("class" in values) columns.class = text("class");
  if ("board" in values) columns.board = text("board");
  if ("school_name" in values) columns.school_name = text("school_name");
  if ("phone" in values) columns.phone = phone("phone");
  if ("parent_name" in values) columns.parent_name = text("parent_name");
  if ("parent_phone" in values) columns.parent_phone = phone("parent_phone");
  if ("city" in values) columns.city = text("city");
  if ("state" in values) columns.state = text("state");
  if ("pincode" in values) columns.pincode = text("pincode");
  if ("address_line" in values) columns.address_line = text("address_line");

  return columns;
}

/**
 * The contact email, which is not the sign-in address.
 *
 * `students.email` is unique and NOT NULL, and for a phone sign-in it holds a
 * synthetic address this platform invented. A student may replace that with a
 * real one; what they may not do is take an address another student already
 * uses, and the constraint violation for that reads like a server fault
 * unless it is caught here.
 *
 * Changing it never touches the auth email — a student who thinks they have
 * changed their login and then cannot get in is a support call, which is why
 * the form says so under the field.
 */
export async function resolveContactEmail(
  values: Record<string, unknown>,
  currentEmail: string,
  studentId: string
): Promise<{ column?: StudentUpdate; error?: string }> {
  if (!("email" in values)) return {};

  const given = typeof values.email === "string" ? values.email.trim() : "";

  // Nothing typed: keep what is there, synthetic or not. The column cannot
  // be null.
  if (given.length === 0) return {};

  const email = given.toLowerCase();
  if (email === currentEmail.toLowerCase()) return {};

  // Exact match, not `ilike`: PostgREST hands it to SQL where `_` is a
  // single-character wildcard, so `john_doe@gmail.com` would then clash with
  // `johnXdoe@gmail.com` and this would read as "already in use" against a
  // row that is a different person. The column is written in lower case
  // everywhere, and `email` is already lowered.
  const service = createServiceClient();
  const { data: clash } = await service
    .from("students")
    .select("id")
    .eq("email", email)
    .neq("id", studentId)
    .maybeSingle();

  if (clash) {
    return { error: "Another Dream Edge account already uses that email address." };
  }

  return { column: { email } };
}
