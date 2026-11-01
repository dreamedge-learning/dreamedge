import type { Metadata } from "next";
export const dynamic = "force-dynamic";
import { StudentShell } from "@/components/student/student-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    default: "Dream Edge Online — Premium Coaching for Classes 6-10",
    template: "%s | Dream Edge Online",
  },
};

type SocialLinks = {
  youtube?: string;
  instagram?: string;
  telegram?: string;
};

/**
 * Social handles live in a single `social_links` jsonb row, not one row per
 * network. Empty strings are treated as unset so the footer can fall back
 * rather than render a dead link.
 */
async function getSocialLinks(): Promise<SocialLinks | undefined> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "social_links")
      .maybeSingle();

    const links = data?.value as Record<string, unknown> | null | undefined;
    if (!links || typeof links !== "object") return undefined;

    const pick = (name: string): string | undefined => {
      const raw = links[name];
      if (typeof raw !== "string") return undefined;
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const resolved: SocialLinks = {
      youtube: pick("youtube"),
      instagram: pick("instagram"),
      telegram: pick("telegram"),
    };

    const hasAny = Object.values(resolved).some(Boolean);
    return hasAny ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const socialLinks = await getSocialLinks();

  return <StudentShell socialLinks={socialLinks}>{children}</StudentShell>;
}
