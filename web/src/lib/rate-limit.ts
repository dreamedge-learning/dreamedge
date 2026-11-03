import { headers } from "next/headers";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Server-side rate limiting for public endpoints.
 *
 * Counting lives in Postgres (`check_rate_limit`), not in module scope: the
 * site runs on serverless functions, so an in-memory counter is reset by the
 * next cold start and enforces nothing. The trade is one round trip per
 * guarded call, which is acceptable on endpoints that already talk to the
 * database or send an SMS.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Zero when allowed. */
  retryAfter: number;
}

/**
 * Best-effort client address.
 *
 * On Vercel `x-forwarded-for` is set by the edge and the left-most entry is
 * the client. It is spoofable in principle, but the header is rewritten at the
 * edge rather than passed through, so it is sound enough to throttle on.
 * Returns null when nothing usable is present, and the limiter then fails open
 * rather than throttling every visitor against a shared empty key.
 */
async function clientAddress(): Promise<string | null> {
  const h = await headers();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return h.get("x-real-ip")?.trim() || null;
}

/**
 * Human-readable wait, for use in the message shown to the user.
 */
export function describeRetryAfter(seconds: number): string {
  if (seconds <= 60) return "in a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in about ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
}

/**
 * Record an attempt against `bucket` and report whether it may proceed.
 *
 * `key` scopes the limit beyond the caller's address — an email or phone
 * number, so that one address cannot cycle through many targets, and one
 * target cannot be hammered from many addresses. Both parts are combined.
 *
 * Failures are swallowed deliberately: if the limiter itself is broken the
 * site should keep working. A rate limiter that takes down login when the
 * database hiccups is worse than one that occasionally lets a burst through.
 */
export async function rateLimit(options: {
  bucket: string;
  key?: string | null;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { bucket, key, limit, windowSeconds } = options;

  const address = await clientAddress();
  const identifier = [address, key].filter(Boolean).join("|");

  if (!identifier) {
    return { allowed: true, retryAfter: 0 };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_identifier: identifier,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error || !data) {
      return { allowed: true, retryAfter: 0 };
    }

    const result = data as { allowed?: boolean; retry_after?: number };
    return {
      allowed: result.allowed !== false,
      retryAfter: Number(result.retry_after) || 0,
    };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Limits, chosen per endpoint cost rather than uniformly.
 *
 * OTP is the tightest because each send costs an SMS credit. Login is loose
 * enough that a person who genuinely forgot their password is not locked out
 * mid-attempt, but tight enough to make credential stuffing impractical.
 */
export const RATE_LIMITS = {
  phoneOtpSend: { limit: 3, windowSeconds: 15 * 60 },
  phoneOtpVerify: { limit: 10, windowSeconds: 15 * 60 },
  login: { limit: 10, windowSeconds: 10 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 4, windowSeconds: 60 * 60 },
  contact: { limit: 5, windowSeconds: 60 * 60 },
  // The gate in front of the admin application form. One shared password
  // is only as strong as the number of guesses allowed against it.
  adminGate: { limit: 5, windowSeconds: 15 * 60 },
  adminApply: { limit: 3, windowSeconds: 60 * 60 },
} as const;
