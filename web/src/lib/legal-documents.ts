import { cache } from "react";

import type { LegalDocument, LegalSlug } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";

/**
 * One policy page's row.
 *
 * Readable by anyone, signed out included, so this uses the request-scoped
 * client rather than the service role. Returns null rather than throwing: a
 * page is better off rendering a short notice with a contact address than a
 * stack trace, and the caller decides what that notice says.
 */
export const getLegalDocument = cache(
  async (slug: LegalSlug): Promise<LegalDocument | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("legal_documents")
        .select("slug, title, effective_date, body, updated_at")
        .eq("slug", slug)
        .maybeSingle();

      if (error || !data) {
        if (error) console.error(`[legal] ${slug} could not be read:`, error);
        return null;
      }

      return data as LegalDocument;
    } catch (error) {
      console.error(`[legal] ${slug} could not be read:`, error);
      return null;
    }
  }
);

/** "22 October 2026", matching how the pages have always shown the date. */
export function formatEffectiveDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
