import { cache } from "react";

import {
  SITE_NAME,
  SITE_TAGLINE,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Platform settings, as the admin panel actually sets them.
 *
 * The panel has always written these to `site_settings`. Nothing read them:
 * every page imported a hardcoded constant from `lib/site.ts` instead, so the
 * support email existed twice and editing it in the panel changed the copy
 * nobody looked at. This is the reader that closes that gap.
 *
 * The constants stay, as the fallback. A missing row, an unreachable database
 * or a key an anonymous visitor may not read all end up here rather than
 * rendering an empty contact page -- which is the failure a settings table
 * invites if its absence is treated as meaningful.
 *
 * Wrapped in React's `cache`, so the handful of callers in one render share a
 * single query rather than each paying for their own.
 */

export interface SocialLinks {
  youtube?: string;
  instagram?: string;
  telegram?: string;
  whatsapp?: string;
}

export interface SiteSettings {
  platform_name: string;
  tagline: string;
  support_email: string;
  support_phone: string;
  maintenance_mode: boolean;
  student_registration_open: boolean;
  razorpay_enabled: boolean;
  referral_system_enabled: boolean;
  /**
   * Private: only an admin may read this row, so a student-side caller would
   * silently get the default. Consult it in admin code only.
   */
  manual_payment_enabled: boolean;
  social_links: SocialLinks;
}

export const SETTINGS_DEFAULTS: SiteSettings = {
  platform_name: SITE_NAME,
  tagline: SITE_TAGLINE,
  support_email: SUPPORT_EMAIL,
  support_phone: SUPPORT_PHONE,
  // Defaults chosen so that a failed read opens the site rather than closing
  // it. A database hiccup must not look like a maintenance window, and must
  // not turn off the payment route mid-purchase.
  maintenance_mode: false,
  student_registration_open: true,
  razorpay_enabled: true,
  referral_system_enabled: true,
  manual_payment_enabled: true,
  social_links: {},
};

function asText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Empty strings count as unset, so the footer falls back rather than linking nowhere. */
function asSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const links: SocialLinks = {};

  for (const name of ["youtube", "instagram", "telegram", "whatsapp"] as const) {
    const raw = source[name];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) links[name] = trimmed;
  }

  return links;
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("site_settings").select("key, value");

    if (error || !data) {
      if (error) console.error("[settings] could not be read:", error);
      return SETTINGS_DEFAULTS;
    }

    const rows = new Map(data.map((row) => [row.key, row.value]));
    const pick = (key: string) => rows.get(key);

    return {
      platform_name: asText(pick("platform_name"), SETTINGS_DEFAULTS.platform_name),
      tagline: asText(pick("tagline"), SETTINGS_DEFAULTS.tagline),
      support_email: asText(pick("support_email"), SETTINGS_DEFAULTS.support_email),
      support_phone: asText(pick("support_phone"), SETTINGS_DEFAULTS.support_phone),
      maintenance_mode: asBoolean(
        pick("maintenance_mode"),
        SETTINGS_DEFAULTS.maintenance_mode
      ),
      student_registration_open: asBoolean(
        pick("student_registration_open"),
        SETTINGS_DEFAULTS.student_registration_open
      ),
      razorpay_enabled: asBoolean(
        pick("razorpay_enabled"),
        SETTINGS_DEFAULTS.razorpay_enabled
      ),
      referral_system_enabled: asBoolean(
        pick("referral_system_enabled"),
        SETTINGS_DEFAULTS.referral_system_enabled
      ),
      manual_payment_enabled: asBoolean(
        pick("manual_payment_enabled"),
        SETTINGS_DEFAULTS.manual_payment_enabled
      ),
      social_links: asSocialLinks(pick("social_links")),
    };
  } catch (error) {
    console.error("[settings] could not be read:", error);
    return SETTINGS_DEFAULTS;
  }
});

/** The E.164 form a `tel:` link needs, from whatever spacing the admin typed. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.startsWith("+") ? digits : `+${digits}`}`;
}
