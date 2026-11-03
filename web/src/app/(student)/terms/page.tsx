import type { Metadata } from "next";

import { LegalBody, LegalUnavailable } from "@/components/student/legal-body";
import { LegalPage } from "@/components/student/legal-page";
import { parseLegalBody } from "@/lib/legal";
import { formatEffectiveDate, getLegalDocument } from "@/lib/legal-documents";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Dream Edge Online. Please read before creating an account or purchasing a course.",
};

/**
 * Read from `legal_documents` rather than written here.
 *
 * The text used to live in this file, which meant the person answerable for
 * the refund terms could not change a word of them without a deploy. The
 * support address comes from the settings and is substituted into the body, so
 * the policy never names an inbox the panel has since replaced.
 */
export default async function TermsPage() {
  const [document, settings] = await Promise.all([
    getLegalDocument("terms"),
    getSiteSettings(),
  ]);

  if (!document) {
    return (
      <LegalPage title="Terms of Service" effectiveDate="—">
        <LegalUnavailable supportEmail={settings.support_email} />
      </LegalPage>
    );
  }

  const blocks = parseLegalBody(document.body, {
    support_email: settings.support_email,
    support_phone: settings.support_phone,
    platform_name: settings.platform_name,
  });

  return (
    <LegalPage
      title={document.title}
      effectiveDate={formatEffectiveDate(document.effective_date)}
    >
      <LegalBody blocks={blocks} />
    </LegalPage>
  );
}
