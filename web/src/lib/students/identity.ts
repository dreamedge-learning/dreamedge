/**
 * Facts about a student record that both sides of the wire need.
 *
 * Kept free of any server import on purpose: the profile page and the admin's
 * detail panel are client components, and pulling in the module that holds
 * the service-role client just to ask whether an email is a placeholder is
 * how a server-only key ends up referenced from a browser bundle.
 */

export type StudentRegistrationSource = "self_online" | "admin_offline" | "admin_import";

export type StudentGender = "male" | "female" | "other" | "prefer_not_to_say";

export const REGISTRATION_SOURCE_LABELS: Record<StudentRegistrationSource, string> = {
  self_online: "Online",
  admin_offline: "Offline centre",
  admin_import: "Imported",
};

/**
 * The label for a source read out of the database.
 *
 * A column value arrives as a plain string, and a row written before the
 * check constraint existed could hold anything, so the lookup has to cope
 * with a value that is not one of the three.
 */
export function registrationSourceLabel(value: string | null | undefined): string {
  if (!value) return "Unknown source";

  return (
    (REGISTRATION_SOURCE_LABELS as Record<string, string>)[value] ?? "Unknown source"
  );
}

/**
 * A stand-in address for a student who has none.
 *
 * `students.email` is NOT NULL and unique, and plenty of Class 6 students
 * genuinely have no email — they sign in with a phone OTP, or an admin
 * registers them at the counter. A synthetic address on a domain we own keeps
 * the column honest without inventing a deliverable one; the panel flags
 * these so a real address can be collected later.
 */
export function syntheticEmailForPhone(phone: string): string {
  return `${phone.replace(/\D/g, "")}@phone.dreamedge.local`;
}

export function syntheticEmailForUser(userId: string): string {
  return `${userId}@user.dreamedge.local`;
}

/** True for an address we invented rather than one a student gave us. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email && /@(phone|user)\.dreamedge\.local$/i.test(email));
}
