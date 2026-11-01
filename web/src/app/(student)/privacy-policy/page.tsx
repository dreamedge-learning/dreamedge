import type { Metadata } from "next";
import { LegalPage } from "@/components/student/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Dream Edge Online collects, uses, and protects your personal information under India's Digital Personal Data Protection Act, 2023.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="22 October 2026">
      <p>
        Dream Edge Online (“Dream Edge”, “we”, “us”, “our”) is operated by
        Dream IIT Institute, Kalmeshwar, Nagpur. This Privacy Policy explains
        what personal information we collect from users of dreamedgelearning.com
        and the Dream Edge mobile app, why we collect it, how we use it, and
        what rights you have over it. It is written to comply with India&apos;s
        Digital Personal Data Protection Act, 2023 (the &quot;DPDP Act&quot;) and the
        Information Technology Act, 2000.
      </p>

      <h2>1. Who this applies to</h2>
      <p>
        This policy applies to everyone who creates a Dream Edge account,
        enrols in a course, or interacts with our platform. If you are under
        18, a parent or legal guardian should read this policy with you and
        consent to it on your behalf before you create an account.
      </p>

      <h2>2. What we collect</h2>
      <p>We collect only what we need to run the service:</p>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email, phone
          number, class / grade, city, and (optional) school name, when you
          sign up.
        </li>
        <li>
          <strong>Payment information</strong> — handled entirely by
          Razorpay. We receive and store the Razorpay order ID, payment ID,
          amount, status, and the last four digits / method of the
          instrument. We do not see or store full card numbers, CVVs, UPI
          PINs, or banking passwords.
        </li>
        <li>
          <strong>Learning activity</strong> — which courses you&apos;ve
          enrolled in, which lessons you&apos;ve viewed or completed, which
          tests you&apos;ve attempted and your scores, and timestamps of
          those actions.
        </li>
        <li>
          <strong>Device & technical data</strong> — device model, operating
          system, app version, IP address, and session tokens. On mobile we
          also store a device identifier so we can enforce the “two active
          devices” limit on your account.
        </li>
        <li>
          <strong>Communications</strong> — any message you send us through
          the contact form, email, or app support, and any response we send
          you.
        </li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>To give you access to the courses, tests, and live classes you&apos;ve purchased.</li>
        <li>To process payments, generate invoices, and issue refunds.</li>
        <li>To track your progress, show your dashboard, and issue certificates.</li>
        <li>To send you course-related notifications (new lesson, upcoming live class, test reminder, enrollment expiry).</li>
        <li>To answer your support messages.</li>
        <li>To secure your account — detect fraud, enforce the device limit, and keep an audit trail of admin actions.</li>
        <li>To improve the platform — understand which lessons are hard, which tests students struggle with, and fix bugs.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information to third
        parties. We do not use your learning data for targeted advertising.
      </p>

      <h2>4. Who we share it with</h2>
      <p>
        We share your personal information only with service providers who
        need it to help us run the platform. These are:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (database, authentication, storage) —
          hosts your account and learning data in encrypted form.
        </li>
        <li>
          <strong>Razorpay</strong> — processes your payments and handles
          refunds.
        </li>
        <li>
          <strong>Cloudflare R2 / Bunny.net / Mux</strong> — stores and
          delivers lesson videos and PDFs over CDN.
        </li>
        <li>
          <strong>Resend</strong> — sends transactional emails (receipts,
          password resets, course updates).
        </li>
        <li>
          <strong>Firebase Cloud Messaging</strong> — delivers push
          notifications to your mobile app.
        </li>
        <li>
          <strong>Vercel</strong> — hosts and serves the website.
        </li>
      </ul>
      <p>
        We may also disclose information if required by a valid Indian legal
        order, court subpoena, or government request. We will notify you of
        such a request where we are legally permitted to do so.
      </p>

      <h2>5. Where your data is stored</h2>
      <p>
        Your data is stored in Supabase&apos;s hosted infrastructure, which
        may process data in regions outside India. We select providers that
        maintain industry-standard security certifications and encryption
        at rest and in transit.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          Account and learning data: for as long as your account is active,
          plus 3 years for tax and dispute-resolution purposes.
        </li>
        <li>
          Payment records: 8 years, per Indian tax regulations.
        </li>
        <li>
          Support messages: 2 years.
        </li>
      </ul>
      <p>
        You may ask us to delete your account at any time — see §8 below.
      </p>

      <h2>7. Security</h2>
      <p>
        We protect your data with: TLS 1.2+ in transit, encryption at rest,
        row-level security policies on every database table, hashed password
        storage via Supabase Auth, PCI-DSS compliant payment handling via
        Razorpay, and regular review of admin access. No system is
        bullet-proof — if we ever discover a breach that materially affects
        you, we will notify you and the relevant authorities as required by
        the DPDP Act.
      </p>

      <h2>8. Your rights under the DPDP Act</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you.</li>
        <li>Correct inaccurate or outdated information.</li>
        <li>Request deletion of your account and personal information (subject to the retention periods above for legal records).</li>
        <li>Withdraw consent for marketing emails or push notifications at any time, through app settings or the unsubscribe link in each email.</li>
        <li>Nominate another person to exercise your rights in case of your death or incapacity.</li>
        <li>Lodge a grievance with the Data Protection Board of India if you believe we have mishandled your data.</li>
      </ul>
      <p>
        To exercise any of these rights, email our Grievance Officer at the
        address below. We will respond within 7 working days.
      </p>

      <h2>9. Cookies and local storage</h2>
      <p>
        We use cookies and browser local storage to keep you signed in, to
        remember your preferences (theme, filters, drafts), and to measure
        basic usage of the platform. We do not use third-party advertising
        cookies.
      </p>

      <h2>10. Children</h2>
      <p>
        Dream Edge is intended for students aged 10 and above. Children
        under 18 should only use the platform with parental consent.
        Parents may contact us at any time to review, correct, or delete
        their child&apos;s information.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy as the platform evolves and as Indian
        privacy law develops. The effective date at the top of this page
        reflects the current version. Material changes will be communicated
        by email.
      </p>

      <h2>12. Grievance Officer</h2>
      <p>
        As required by the Information Technology (Reasonable Security
        Practices and Procedures) Rules, 2011 and the DPDP Act, our
        Grievance Officer can be reached at:
      </p>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </li>
        <li>
          <strong>Address:</strong> Dream IIT Institute, Kalmeshwar, Nagpur,
          Maharashtra, India.
        </li>
      </ul>
    </LegalPage>
  );
}
