import {
  syntheticEmailForPhone,
  syntheticEmailForUser,
  type StudentGender,
  type StudentRegistrationSource,
} from "@/lib/students/identity";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The one place a `students` row is created.
 *
 * There are four callers: email signup, phone OTP, the OAuth callback, and
 * the admin's offline registration form. Each used to write its own insert
 * with its own defaults, which is how the OAuth path ended up creating
 * students called "Student" with no class and no way to reach a parent while
 * the signup path collected both. With the profile now mandatory, the same
 * drift would mean the gate is enforced in four places and holds in three.
 *
 * What this owns: the email fallback shape, the name fallback, and the
 * defaults. What it deliberately does not own is `student_code` and
 * `referral_code` — a BEFORE INSERT trigger assigns those, because the
 * Flutter app writes its own row and no TypeScript helper can reach Dart.
 * See migration 20261104000000.
 */

/** Everything a caller may set; anything omitted stays null. */
export interface StudentProfileFields {
  full_name?: string | null;
  /** Contact email. Falls back to a synthetic address — see `resolveEmail`. */
  email?: string | null;
  phone?: string | null;
  class?: string | null;
  board?: string | null;
  school_name?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  address_line?: string | null;
  date_of_birth?: string | null;
  gender?: StudentGender | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  referred_by?: string | null;
  avatar_url?: string | null;
  admin_notes?: string | null;
  /** True only when the caller has collected every required field already. */
  profile_completed?: boolean;
  /** Backdatable, for a form collected at the centre days earlier. */
  created_at?: string | null;
}

export interface CreateStudentInput {
  userId: string;
  source: StudentRegistrationSource;
  /** `admin_users.id` of whoever typed the record in, for the offline path. */
  registeredBy?: string | null;
  fields?: StudentProfileFields;
  /** The auth user's own email and phone, used only as a fallback. */
  authEmail?: string | null;
  authPhone?: string | null;
}

export interface CreatedStudent {
  id: string;
  student_code: string | null;
  referral_code: string | null;
  full_name: string;
  email: string;
  profile_completed: boolean;
}

function resolveEmail(input: CreateStudentInput): string {
  const given = input.fields?.email?.trim() || input.authEmail?.trim();
  if (given) return given.toLowerCase();

  const phone = input.fields?.phone?.trim() || input.authPhone?.trim();
  if (phone) return syntheticEmailForPhone(phone);

  return syntheticEmailForUser(input.userId);
}

function resolveName(input: CreateStudentInput): string {
  return input.fields?.full_name?.trim() || "Student";
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

export async function createStudentProfile(
  input: CreateStudentInput
): Promise<{ data?: CreatedStudent; error?: string }> {
  const fields = input.fields ?? {};
  const service = createServiceClient();

  const completed = fields.profile_completed === true;

  const { data, error } = await service
    .from("students")
    .insert({
      user_id: input.userId,
      full_name: resolveName(input),
      email: resolveEmail(input),
      phone: trimmed(fields.phone),
      class: trimmed(fields.class),
      board: trimmed(fields.board),
      school_name: trimmed(fields.school_name),
      city: trimmed(fields.city),
      state: trimmed(fields.state),
      pincode: trimmed(fields.pincode),
      address_line: trimmed(fields.address_line),
      date_of_birth: trimmed(fields.date_of_birth),
      gender: fields.gender ?? null,
      parent_name: trimmed(fields.parent_name),
      parent_phone: trimmed(fields.parent_phone),
      referred_by: trimmed(fields.referred_by),
      avatar_url: trimmed(fields.avatar_url),
      admin_notes: trimmed(fields.admin_notes),
      registration_source: input.source,
      registered_by: input.registeredBy ?? null,
      profile_completed: completed,
      profile_completed_at: completed ? new Date().toISOString() : null,
      ...(fields.created_at ? { created_at: fields.created_at } : {}),
    })
    .select("id, student_code, referral_code, full_name, email, profile_completed")
    .single();

  if (error) {
    // The unique constraints are the ones that fail in practice: a second
    // profile for the same auth user, or a student whose email is already on
    // another record. Callers decide what to do about it, so name which.
    console.error("createStudentProfile failed:", error);

    if (error.code === "23505") {
      if (error.message.includes("students_user_id")) {
        return { error: "This account already has a student profile." };
      }
      if (error.message.includes("students_email")) {
        return { error: "A student with this email address already exists." };
      }
    }

    return { error: "Could not create the student profile. Please try again." };
  }

  return { data };
}

/**
 * The existing profile for an auth user, if there is one.
 *
 * Every creation path checks this first. Without it a student who signs in
 * with Google after registering by email gets a second profile, and from then
 * on their enrolments live on one record and their progress on the other.
 */
export async function findStudentByUserId(userId: string) {
  const service = createServiceClient();

  const { data } = await service
    .from("students")
    .select("id, user_id, student_code, full_name, email, profile_completed")
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

/**
 * The existing profile for an email address, if there is one.
 *
 * Used where a student can arrive by a second route with the same address:
 * the OAuth callback, and the admin registering someone who already signed up
 * online. `students.email` is unique, so this is the lookup that prevents the
 * duplicate the insert would otherwise refuse.
 */
export async function findStudentByEmail(email: string) {
  const service = createServiceClient();

  // Exact match, not `ilike`. PostgREST maps `ilike` straight through to the
  // SQL operator, where `_` is a single-character wildcard: a lookup for
  // `john_doe@gmail.com` would then match a stored `johnXdoe@gmail.com` and
  // send the OAuth callback into the re-point branch against someone else's
  // record. The column is written in lower case everywhere a row is
  // created, so a case-exact comparison is the honest one.
  const { data } = await service
    .from("students")
    .select("id, user_id, student_code, full_name, email, profile_completed")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  return data;
}
