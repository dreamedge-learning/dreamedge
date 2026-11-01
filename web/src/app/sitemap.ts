import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/lib/site";

// Re-generated hourly; course publication changes should surface quickly
// without rebuilding the whole site.
export const revalidate = 3600;

const STATIC_ROUTES: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/courses", priority: 0.9, changeFrequency: "daily" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return entries;

  try {
    // Anonymous read: row-level security exposes only published courses.
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabase
      .from("courses")
      .select("slug, updated_at")
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(1000);

    for (const course of data ?? []) {
      if (!course.slug) continue;
      entries.push({
        url: absoluteUrl(`/courses/${course.slug}`),
        lastModified: course.updated_at ? new Date(course.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch {
    // A sitemap must still render if the catalogue cannot be reached.
  }

  return entries;
}
