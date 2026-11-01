import type { Metadata } from "next";
import { LegalPage } from "@/components/student/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How refunds and cancellations work on Dream Edge Online — eligibility, timelines, and how to request one.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" effectiveDate="22 October 2026">
      <p>
        This policy explains when and how you can cancel a Dream Edge Online
        subscription and request a refund. By completing a purchase on
        dreamedgelearning.com or the Dream Edge mobile app, you agree to the terms
        on this page.
      </p>

      <h2>1. 7-day refund window</h2>
      <p>
        We offer a <strong>7-day refund window</strong> on every paid course,
        starting from the day of purchase. If you decide the course is not
        right for you within those first 7 days and you have not consumed more
        than 20% of the course content (as measured by lessons marked complete
        or watched in full), you are eligible for a full refund of the amount
        paid.
      </p>
      <ul>
        <li>Request must be made within 7 calendar days of the purchase date.</li>
        <li>
          Course consumption must be below 20% at the time of request.
        </li>
        <li>
          Refunds are processed to the original payment method only.
        </li>
      </ul>

      <h2>2. What is not refundable</h2>
      <ul>
        <li>
          Courses purchased more than 7 days ago, regardless of consumption.
        </li>
        <li>
          Courses where more than 20% of the lessons have been accessed.
        </li>
        <li>
          Live-class seats where the class has already been held, or where
          you have joined any live session on the schedule.
        </li>
        <li>
          Downloaded notes, PDFs, printables, or any other digital assets
          whose files have already been downloaded to your device.
        </li>
        <li>
          Promotional, discounted, or referral-code purchases where the
          original invoice value was less than ₹1 (one rupee) after discount.
        </li>
      </ul>

      <h2>3. How to request a refund</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
        from the email address registered on your Dream Edge account with the
        following:
      </p>
      <ul>
        <li>Your full name and registered phone number.</li>
        <li>The course name and the Razorpay order ID shown on your invoice.</li>
        <li>A short reason — we read every one of these and use them to improve.</li>
      </ul>
      <p>
        We will confirm receipt within 1 working day, review eligibility
        against the rules above, and respond with the decision within 3
        working days.
      </p>

      <h2>4. Refund timelines</h2>
      <p>
        Approved refunds are initiated on our side within 2 working days of
        approval. Razorpay typically returns the money to the original payment
        method within <strong>5 to 7 working days</strong> of that initiation.
        Some banks and card networks take up to 10 working days — this part is
        outside our control, and we are happy to share the Razorpay refund
        reference ID so you can trace it with your bank.
      </p>

      <h2>5. Cancellations before purchase</h2>
      <p>
        You can abandon the checkout at any point before you complete payment.
        Nothing is charged until Razorpay confirms the payment and we grant
        access to the course. If a payment was debited from your account but
        access was not granted (for example, the Razorpay callback failed),
        write to us at the email above and we will either grant the access or
        issue a full refund within 2 working days.
      </p>

      <h2>6. Exceptional cases</h2>
      <p>
        We reserve the right to approve refund requests outside the 7-day
        window in genuinely exceptional circumstances — bereavement, serious
        illness, prolonged medical emergency, documented account compromise,
        or a technical issue on our side that materially prevented you from
        using the course. These decisions are made case by case.
      </p>

      <h2>7. Chargebacks</h2>
      <p>
        We encourage you to reach out to us before initiating a chargeback
        with your bank or card issuer. In most cases we can resolve the issue
        within 1–2 working days. Chargebacks initiated without first
        contacting support may result in loss of access to all courses on
        your account while the dispute is reviewed.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The effective date at
        the top of this page always reflects the current version. Material
        changes will be communicated by email to the address on your account.
      </p>

      <h2>9. Contact</h2>
      <p>
        For anything related to refunds or cancellations:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
