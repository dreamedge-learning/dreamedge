import type { Metadata } from "next";
import { LegalPage } from "@/components/student/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Dream Edge Online. Please read before creating an account or purchasing a course.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="22 October 2026">
      <p>
        These Terms of Service (“Terms”) govern your access to and use of
        Dream Edge Online — the website at dreamedgelearning.com and the Dream
        Edge mobile applications (collectively, the “Platform”), operated
        by Dream IIT Institute, Kalmeshwar, Nagpur. By creating an account,
        enrolling in a course, or otherwise using the Platform, you agree
        to these Terms.
      </p>

      <h2>1. Who can use Dream Edge</h2>
      <ul>
        <li>You must be at least 10 years old to use the Platform.</li>
        <li>
          If you are under 18, a parent or legal guardian must read these
          Terms, create and manage the account on your behalf, and consent
          to any paid purchase.
        </li>
        <li>
          You agree to provide accurate information when creating your
          account and to keep that information up to date.
        </li>
        <li>
          One account per person. Sharing an account with other students —
          whether paid or free — is a breach of these Terms.
        </li>
      </ul>

      <h2>2. Account security and devices</h2>
      <p>
        You are responsible for keeping your password confidential and for
        every activity under your account. If you believe your account has
        been accessed by someone else, change your password and email us at
        once.
      </p>
      <p>
        Each account may be signed in on up to two devices at the same
        time. Signing in from a third device will sign out the oldest
        session. We do this to prevent casual account sharing — not to
        inconvenience genuine users. If you change devices often (losing a
        phone, factory reset), write to us and we will help.
      </p>

      <h2>3. Courses, content, and intellectual property</h2>
      <ul>
        <li>
          Every lesson, PDF, video, test question, worksheet, and image on
          the Platform is the intellectual property of Dream Edge or its
          licensors. You receive a limited, personal, non-transferable
          licence to view and use the content for your own learning.
        </li>
        <li>
          You may not download, screen-record, re-upload, re-share, or
          redistribute any Dream Edge content on YouTube, Telegram,
          WhatsApp, torrent sites, or any other platform. Doing so is
          grounds for immediate termination of your account without refund,
          and may expose you to civil and criminal liability under the
          Copyright Act, 1957 and the IT Act, 2000.
        </li>
        <li>
          You may download the printable notes and worksheets that we have
          explicitly marked as “downloadable” for your own personal use —
          not for sale or distribution.
        </li>
        <li>
          Any mock-test attempt, test answer, or feedback you submit may be
          used by us (anonymised) to improve the Platform.
        </li>
      </ul>

      <h2>4. Payments, pricing, and taxes</h2>
      <ul>
        <li>
          All prices are shown in Indian Rupees (INR) and are inclusive of
          applicable GST unless stated otherwise.
        </li>
        <li>
          Payments are processed by Razorpay. By completing a payment, you
          also agree to Razorpay&apos;s terms and privacy policy.
        </li>
        <li>
          Course access is granted after Razorpay confirms the payment. In
          rare cases the confirmation can take a few minutes — if your
          account was debited but access was not granted within an hour,
          write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with the Razorpay order ID.
        </li>
        <li>
          Each course has a stated validity period, which starts from the
          date of purchase. Access ends automatically when the validity
          expires.
        </li>
        <li>
          Prices and promotional discounts can change at any time. The
          price at the time of purchase is the price you pay.
        </li>
      </ul>

      <h2>5. Refunds</h2>
      <p>
        Our full refund policy is on a dedicated page:{" "}
        <a href="/refund-policy">Refund &amp; Cancellation Policy</a>. In
        short, a full refund is available within 7 days of purchase if less
        than 20% of the course has been consumed.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Share your account credentials with any other person.</li>
        <li>Record, copy, or redistribute Dream Edge content.</li>
        <li>
          Attempt to bypass paywalls, device limits, or any other technical
          protection on the Platform.
        </li>
        <li>
          Automate access with bots, scrapers, or scripts that place
          unusual load on our servers.
        </li>
        <li>
          Upload or submit any content that is unlawful, defamatory,
          obscene, or infringes anyone&apos;s rights, including in tests,
          messages, or support tickets.
        </li>
        <li>
          Harass, threaten, or impersonate any mentor, student, or Dream
          Edge staff.
        </li>
      </ul>

      <h2>7. Live classes</h2>
      <p>
        Live classes are held on the dates and times shown in your course
        schedule. Timings may change due to unforeseen circumstances —
        we&apos;ll notify you by push notification and email if that
        happens. Every live class is recorded, edited, and uploaded as a
        “rewatch” within 3–4 hours of the end of the class. Missing a live
        class is not grounds for a refund.
      </p>

      <h2>8. Certificates</h2>
      <p>
        Certificates issued at the end of a course or test are
        recognition of your participation and performance on the Dream
        Edge Platform. They are not government-issued qualifications or
        affiliated with any school board or university.
      </p>

      <h2>9. Service availability</h2>
      <p>
        We work hard to keep the Platform up at all times, but we do not
        guarantee uninterrupted service. Scheduled maintenance,
        third-party outages (Supabase, Razorpay, Vercel, R2), and
        force-majeure events may cause temporary downtime. If a planned
        live class is affected, we will reschedule.
      </p>

      <h2>10. Account suspension and termination</h2>
      <p>
        We may suspend or terminate your account, without refund, if you
        breach these Terms — in particular, if you share your account, redistribute
        content, or engage in fraudulent payments or chargeback abuse. We will
        give you written notice via email with the reason, and a chance to
        respond, unless the breach is so serious that immediate termination
        is necessary.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The Platform is provided on an “as is” and “as available” basis.
        While we work hard to make our courses accurate and effective, we
        do not guarantee that any particular grade, rank, or exam outcome
        will follow from using Dream Edge. Learning depends on the student
        too.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Dream Edge&apos;s total
        liability for any claim arising out of or relating to the Platform
        or your use of it shall not exceed the total amount you have paid
        to Dream Edge in the 12 months preceding the event giving rise to
        the claim. Dream Edge is not liable for indirect, incidental,
        consequential, or punitive damages.
      </p>

      <h2>13. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by the laws of India. Any dispute
        arising out of or in connection with these Terms shall be subject
        to the exclusive jurisdiction of the courts at Nagpur, Maharashtra.
      </p>

      <h2>14. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material
        changes, we&apos;ll notify you by email at the address on your
        account and give you at least 7 days before the changes take
        effect. Continued use of the Platform after that date means you
        accept the updated Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
