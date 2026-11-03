import type { Metadata } from "next";
import { LegalPage } from "@/components/student/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How refunds work on Dream Edge Online — paid enrolments are final, and refunds are issued only when Dream Edge cancels a course.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" effectiveDate="3 November 2026">
      <p>
        This policy explains when a refund is possible on Dream Edge Online. By
        completing a purchase on dreamedgelearning.com or the Dream Edge mobile
        app, you agree to the terms on this page. Please read it before you pay.
      </p>

      <h2>1. Paid enrolments are final</h2>
      <p>
        <strong>
          Once you enrol in a paid course, the enrolment is final and no refund
          is available.
        </strong>{" "}
        A course gives you immediate access to recorded lessons, notes, past
        papers, downloadable material and test series. That access cannot be
        returned once it has been granted, so we do not offer a trial window, a
        cooling-off period, or refunds for change of mind.
      </p>
      <p>In particular, a refund is not available because:</p>
      <ul>
        <li>You changed your mind after paying.</li>
        <li>You did not start the course, or did not use it as much as you planned.</li>
        <li>You enrolled in the wrong class, board or subject by mistake.</li>
        <li>You are dissatisfied with teaching style, pace, or difficulty level.</li>
        <li>Your schedule, school timetable or personal circumstances changed.</li>
        <li>You could not attend live classes, which remain available as recordings.</li>
        <li>
          Your device, internet connection or storage was not sufficient to use
          the course.
        </li>
      </ul>
      <p>
        We publish detailed syllabus, sample lessons and pricing on every course
        page so you can decide before you pay. If you are unsure whether a
        course is right for you, contact us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> before
        purchasing — we are happy to advise.
      </p>

      <h2>2. The one case where a refund is issued</h2>
      <p>
        <strong>
          If Dream Edge cancels a course, a refund is issued for that course.
        </strong>{" "}
        This applies when our team withdraws or discontinues a course you are
        enrolled in and we are unable to deliver the remaining content.
      </p>
      <ul>
        <li>
          The refund is calculated on the amount you actually paid for that
          course, after any discount or referral code.
        </li>
        <li>
          Where a course is cancelled partway through, the refund is calculated
          on a pro-rata basis for the undelivered portion of the course.
        </li>
        <li>
          You do not need to apply. We identify every affected enrolment and
          initiate the refund ourselves, and we notify you by email and in-app
          notification when we do.
        </li>
        <li>
          Refunds are returned to the original payment method only. We cannot
          redirect a refund to a different card, account or UPI ID.
        </li>
      </ul>
      <p>
        Rescheduling a live class, replacing a teacher, or changing the order in
        which topics are taught is not a cancellation. Only the withdrawal of
        the course itself is.
      </p>

      <h2>3. Payment debited but access not granted</h2>
      <p>
        This is not a refund of a course — it is the correction of a failed
        transaction, and it is always put right. If money left your account but
        the course did not appear in your dashboard (for example, the payment
        callback failed), write to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the
        Razorpay payment ID and the registered phone number on your account. We
        will either grant the access or return the full amount within{" "}
        <strong>2 working days</strong> of confirming the payment with Razorpay.
      </p>
      <p>
        The same applies to a duplicate payment: if you were charged twice for
        the same course, the duplicate charge is returned in full.
      </p>

      <h2>4. Refund timelines</h2>
      <p>
        Where a refund is due under section 2 or 3, we initiate it on our side
        within <strong>2 working days</strong>. Razorpay then typically returns
        the money to the original payment method within{" "}
        <strong>5 to 7 working days</strong>. Some banks and card networks take
        up to 10 working days — that part is outside our control, and we will
        share the Razorpay refund reference ID so you can trace it with your
        bank.
      </p>

      <h2>5. Cancelling before you pay</h2>
      <p>
        You can leave the checkout at any point before completing payment, and
        nothing is charged. Access is granted only after Razorpay confirms the
        payment.
      </p>

      <h2>6. Offline and counter payments</h2>
      <p>
        Fees collected in cash, by UPI or by cheque at the Dream IIT centre in
        Kalmeshwar follow this same policy. Where a refund is due, it is paid
        back through the same channel it was collected, against the receipt
        issued at the counter.
      </p>

      <h2>7. Chargebacks</h2>
      <p>
        Please contact us before raising a chargeback with your bank or card
        issuer. In most cases we can resolve the matter within 1–2 working
        days. A chargeback raised without contacting support first may result
        in suspension of access to all courses on your account while the
        dispute is reviewed.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The effective date at the
        top of this page always reflects the current version, and the policy
        that applies to your purchase is the one in force on the day you paid.
        Material changes will be communicated by email to the address on your
        account.
      </p>

      <h2>9. Contact</h2>
      <p>
        For anything related to refunds or cancellations:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
