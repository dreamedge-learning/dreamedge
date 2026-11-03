import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The pass that gets somebody past the admin-application gate.
 *
 * The gate password itself is checked once, by `verify_admin_gate` in the
 * database. What survives that check is this cookie: a timestamp and an HMAC
 * over it, so the form's own server action can tell a visitor who cleared the
 * gate from one who went straight to the submit endpoint. Nothing about the
 * applicant is in it -- they are signed out, so there is no identity to bind
 * to, and the short life is what limits a shared cookie.
 *
 * The signing key is derived from the service-role key rather than read from a
 * new environment variable. That key is server-only, already required for the
 * app to boot, and an HMAC never reveals it; a new variable would be one more
 * thing to remember on Vercel, and forgetting it would break the gate open or
 * shut depending on how it failed.
 */

const COOKIE_NAME = "de_admin_gate";
const TTL_SECONDS = 30 * 60;

/** Scoped to the admin tree: the form and its action both live under it. */
const COOKIE_PATH = "/admin";

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  // A derived subkey, so the cookie's signature is never an HMAC taken
  // directly over the key it is derived from.
  return createHmac("sha256", secret).update("admin-gate-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Marks this browser as having cleared the gate. */
export async function issueGatePass(): Promise<void> {
  const expiresAt = String(Date.now() + TTL_SECONDS * 1000);
  const store = await cookies();

  store.set(COOKIE_NAME, `${expiresAt}.${sign(expiresAt)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: TTL_SECONDS,
  });
}

export async function clearGatePass(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
}

/**
 * Whether this request carries a live, correctly signed pass.
 *
 * Compared with `timingSafeEqual` on equal-length buffers; an unequal length is
 * rejected before the comparison, because `timingSafeEqual` throws on a
 * mismatch rather than returning false.
 */
export async function hasGatePass(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;

  if (!raw) return false;

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}
