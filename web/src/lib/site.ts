/**
 * Canonical public origin for the site.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL      -- explicit override
 *   2. VERCEL_PROJECT_PRODUCTION_URL -- the stable production domain on Vercel
 *   3. the registered domain
 *
 * Needed because Next cannot build absolute Open Graph / canonical URLs
 * without `metadataBase`; without it every og:image resolves relative and
 * social previews silently break.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://dreamedgelearning.com";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Dream Edge Online";
export const SITE_TAGLINE = "Premium Coaching for Classes 6-10";
export const SITE_DESCRIPTION =
  "Master your foundation with Dream Edge. Premium online coaching for Classes 6-10 (CBSE & State Board) by IITian mentors. Concept-based learning, live classes, test series & more.";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Support contact details.
 *
 * Single source of truth. These appear in the contact page, the legal pages,
 * the footer and the global error boundary; keeping them here means a change
 * of number or inbox is a one-line edit rather than a sweep across the tree.
 *
 * `SUPPORT_PHONE_HREF` is the E.164 form required by `tel:` links, kept apart
 * from the display form so the spacing can change without breaking dialling.
 */
export const SUPPORT_EMAIL = "supportteam@dreamedgelearning.com";
export const SUPPORT_PHONE = "+91 96375 47539";
export const SUPPORT_PHONE_HREF = "tel:+919637547539";
export const SUPPORT_HOURS = "Mon-Sat, 10 AM - 7 PM IST";
