/**
 * Facts about a student record that both sides of the wire need.
 *
 * Kept free of any server import on purpose: the profile page and the admin's
 * detail panel are client components, and pulling in the module that holds
 * the service-role client just to ask whether an email is a placeholder is
 * how a server-only key ends up referenced from a browser bundle.
 */

export type StudentRegistrationSource = "self_online" | "admin_offline" | "admin_import";

export type StudentGender = "male" | "female";

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
 *
 * `discriminator` scopes the address to one student rather than one phone.
 * Two siblings sharing a parent's number would otherwise land on the same
 * synthetic address and the second registration would hit the unique index —
 * the normal case at the Kalmeshwar counter, with the cash in the drawer.
 * Callers that write one row per auth user (phone-OTP signup) may omit it;
 * callers that write several rows for one phone (admin registering a family)
 * must pass something unique per student.
 */
export function syntheticEmailForPhone(phone: string, discriminator?: string): string {
  const digits = phone.replace(/\D/g, "");
  const tag = discriminator ? `-${discriminator.replace(/[^a-z0-9]/gi, "").toLowerCase()}` : "";
  return `${digits}${tag}@phone.dreamedge.local`;
}

export function syntheticEmailForUser(userId: string): string {
  return `${userId}@user.dreamedge.local`;
}

/**
 * A short random tag suitable for a synthetic email's discriminator.
 *
 * Six base-36 characters is a 1-in-2 billion collision for the second entry
 * against the same phone, which is enough for a counter that registers at
 * most a few families per day. The character set is a-z0-9, which the
 * regex at the top of the module (and `isSyntheticEmail` below) does not
 * reject.
 */
export function syntheticEmailDiscriminator(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

/** True for an address we invented rather than one a student gave us. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email && /@(phone|user)\.dreamedge\.local$/i.test(email));
}
