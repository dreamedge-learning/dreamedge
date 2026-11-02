/**
 * Indian mobile numbers, in one shape.
 *
 * Numbers reach us typed by a student on a phone, typed by an admin from a
 * printed form, and returned by Supabase after an OTP, in every spacing and
 * prefix combination people use. Supabase's phone auth keys on the E.164
 * form, so anything stored in a different shape is a number the student can
 * never sign in with and an admin can never match against.
 */

/** Mobile numbers in India start with 6-9 and are ten digits long. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** E.164 (+91XXXXXXXXXX), or null when the input is not a mobile number. */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  const ten =
    digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits.length === 10
        ? digits
        : null;

  if (!ten || !INDIAN_MOBILE.test(ten)) return null;

  return `+91${ten}`;
}

/** The ten digits alone, for display and for a `tel:` link. */
export function indianPhoneDigits(raw: string | null | undefined): string | null {
  const normalized = normalizeIndianPhone(raw);
  return normalized ? normalized.slice(3) : null;
}
