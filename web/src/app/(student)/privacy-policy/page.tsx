import type { Metadata } from "next";

import { LegalBody, LegalUnavailable } from "@/components/student/legal-body";
import { LegalPage } from "@/components/student/legal-page";
import { parseLegalBody } from "@/lib/legal";
import { formatEffectiveDate, getLegalDocument } from "@/lib/legal-documents";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Dream Edge Online collects, uses, and protects your personal information under India's Digital Personal Data Protection Act, 2023.",
};

/**
 * Read from `legal_documents` rather than written here.
 *
 * The text used to live in this file, which meant the person answerable for
 * the refund terms could not change a word of them without a deploy. The
 * support address comes from the settings and is substituted into the body, so
 * the policy never names an inbox the panel has since replaced.
 */
export default async function PrivacyPolicyPage() {
  const [document, settings] = await Promise.all([
    getLegalDocument("privacy-policy"),
    getSiteSettings(),
  ]);

  if (!document) {
    return (
      <LegalPage title="Privacy Policy" effectiveDate="—">
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
