-- The text that is live today, moved into the table unchanged.
--
-- Transcribed from the three page components rather than rewritten: this
-- migration is a move, not an edit. Two contradictions were found in it and
-- deliberately left alone, because the refund terms of a site taking payments
-- are not a thing to quietly change in a migration:
--
--   * Terms section 5 promises a full refund within 7 days under 20%
--     consumption. The refund policy says enrolments are final and the only
--     refund case is Dream Edge cancelling a course.
--   * Terms section 2 and privacy section 2 both describe a two-device limit
--     that evicts the oldest session. Nothing reads
--     `max_devices_per_student`; no such limit exists.
--
-- Both are now editable in the panel, which is the point.

insert into public.legal_documents (slug, title, effective_date, body) values
('refund-policy', 'Refund & Cancellation Policy', '2026-11-03', $body$
This policy explains when a refund is possible on Dream Edge Online. By completing a purchase on dreamedgelearning.com or the Dream Edge mobile app, you agree to the terms on this page. Please read it before you pay.

## 1. Paid enrolments are final

**Once you enrol in a paid course, the enrolment is final and no refund is available.** A course gives you immediate access to recorded lessons, notes, past papers, downloadable material and test series. That access cannot be returned once it has been granted, so we do not offer a trial window, a cooling-off period, or refunds for change of mind.

In particular, a refund is not available because:

- You changed your mind after paying.
- You did not start the course, or did not use it as much as you planned.
- You enrolled in the wrong class, board or subject by mistake.
- You are dissatisfied with teaching style, pace, or difficulty level.
- Your schedule, school timetable or personal circumstances changed.
- You could not attend live classes, which remain available as recordings.
- Your device, internet connection or storage was not sufficient to use the course.

We publish detailed syllabus, sample lessons and pricing on every course page so you can decide before you pay. If you are unsure whether a course is right for you, contact us at {{support_email}} before purchasing — we are happy to advise.

## 2. The one case where a refund is issued

**If Dream Edge cancels a course, a refund is issued for that course.** This applies when our team withdraws or discontinues a course you are enrolled in and we are unable to deliver the remaining content.

- The refund is calculated on the amount you actually paid for that course, after any discount or referral code.
- Where a course is cancelled partway through, the refund is calculated on a pro-rata basis for the undelivered portion of the course.
- You do not need to apply. We identify every affected enrolment and initiate the refund ourselves, and we notify you by email and in-app notification when we do.
- Refunds are returned to the original payment method only. We cannot redirect a refund to a different card, account or UPI ID.

Rescheduling a live class, replacing a teacher, or changing the order in which topics are taught is not a cancellation. Only the withdrawal of the course itself is.

## 3. Payment debited but access not granted

This is not a refund of a course — it is the correction of a failed transaction, and it is always put right. If money left your account but the course did not appear in your dashboard (for example, the payment callback failed), write to {{support_email}} with the Razorpay payment ID and the registered phone number on your account. We will either grant the access or return the full amount within **2 working days** of confirming the payment with Razorpay.

The same applies to a duplicate payment: if you were charged twice for the same course, the duplicate charge is returned in full.

## 4. Refund timelines

Where a refund is due under section 2 or 3, we initiate it on our side within **2 working days**. Razorpay then typically returns the money to the original payment method within **5 to 7 working days**. Some banks and card networks take up to 10 working days — that part is outside our control, and we will share the Razorpay refund reference ID so you can trace it with your bank.

## 5. Cancelling before you pay

You can leave the checkout at any point before completing payment, and nothing is charged. Access is granted only after Razorpay confirms the payment.

## 6. Offline and counter payments

Fees collected in cash, by UPI or by cheque at the Dream IIT centre in Kalmeshwar follow this same policy. Where a refund is due, it is paid back through the same channel it was collected, against the receipt issued at the counter.

## 7. Chargebacks

Please contact us before raising a chargeback with your bank or card issuer. In most cases we can resolve the matter within 1–2 working days. A chargeback raised without contacting support first may result in suspension of access to all courses on your account while the dispute is reviewed.

## 8. Changes to this policy

We may update this policy from time to time. The effective date at the top of this page always reflects the current version, and the policy that applies to your purchase is the one in force on the day you paid. Material changes will be communicated by email to the address on your account.

## 9. Contact

For anything related to refunds or cancellations: {{support_email}}.
$body$),

('privacy-policy', 'Privacy Policy', '2026-10-22', $body$
Dream Edge Online (“Dream Edge”, “we”, “us”, “our”) is operated by Dream IIT Institute, Kalmeshwar, Nagpur. This Privacy Policy explains what personal information we collect from users of dreamedgelearning.com and the Dream Edge mobile app, why we collect it, how we use it, and what rights you have over it. It is written to comply with India's Digital Personal Data Protection Act, 2023 (the "DPDP Act") and the Information Technology Act, 2000.

## 1. Who this applies to

This policy applies to everyone who creates a Dream Edge account, enrols in a course, or interacts with our platform. If you are under 18, a parent or legal guardian should read this policy with you and consent to it on your behalf before you create an account.

## 2. What we collect

We collect only what we need to run the service:

- **Account information** — your name, email, phone number, class / grade, city, and (optional) school name, when you sign up.
- **Payment information** — handled entirely by Razorpay. We receive and store the Razorpay order ID, payment ID, amount, status, and the last four digits / method of the instrument. We do not see or store full card numbers, CVVs, UPI PINs, or banking passwords.
- **Learning activity** — which courses you've enrolled in, which lessons you've viewed or completed, which tests you've attempted and your scores, and timestamps of those actions.
- **Device & technical data** — device model, operating system, app version, IP address, and session tokens. On mobile we also store a device identifier so we can enforce the “two active devices” limit on your account.
- **Communications** — any message you send us through the contact form, email, or app support, and any response we send you.

## 3. How we use it

- To give you access to the courses, tests, and live classes you've purchased.
- To process payments, generate invoices, and issue refunds.
- To track your progress, show your dashboard, and issue certificates.
- To send you course-related notifications (new lesson, upcoming live class, test reminder, enrollment expiry).
- To answer your support messages.
- To secure your account — detect fraud, enforce the device limit, and keep an audit trail of admin actions.
- To improve the platform — understand which lessons are hard, which tests students struggle with, and fix bugs.

We do **not** sell your personal information to third parties. We do not use your learning data for targeted advertising.

## 4. Who we share it with

We share your personal information only with service providers who need it to help us run the platform. These are:

- **Supabase** (database, authentication, storage) — hosts your account and learning data in encrypted form.
- **Razorpay** — processes your payments and handles refunds.
- **Cloudflare R2 / Bunny.net / Mux** — stores and delivers lesson videos and PDFs over CDN.
- **Resend** — sends transactional emails (receipts, password resets, course updates).
- **Firebase Cloud Messaging** — delivers push notifications to your mobile app.
- **Vercel** — hosts and serves the website.

We may also disclose information if required by a valid Indian legal order, court subpoena, or government request. We will notify you of such a request where we are legally permitted to do so.

## 5. Where your data is stored

Your data is stored in Supabase's hosted infrastructure, which may process data in regions outside India. We select providers that maintain industry-standard security certifications and encryption at rest and in transit.

## 6. How long we keep it

- Account and learning data: for as long as your account is active, plus 3 years for tax and dispute-resolution purposes.
- Payment records: 8 years, per Indian tax regulations.
- Support messages: 2 years.

You may ask us to delete your account at any time — see section 8 below.

## 7. Security

We protect your data with: TLS 1.2+ in transit, encryption at rest, row-level security policies on every database table, hashed password storage via Supabase Auth, PCI-DSS compliant payment handling via Razorpay, and regular review of admin access. No system is bullet-proof — if we ever discover a breach that materially affects you, we will notify you and the relevant authorities as required by the DPDP Act.

## 8. Your rights under the DPDP Act

You have the right to:

- Access the personal information we hold about you.
- Correct inaccurate or outdated information.
- Request deletion of your account and personal information (subject to the retention periods above for legal records).
- Withdraw consent for marketing emails or push notifications at any time, through app settings or the unsubscribe link in each email.
- Nominate another person to exercise your rights in case of your death or incapacity.
- Lodge a grievance with the Data Protection Board of India if you believe we have mishandled your data.

To exercise any of these rights, email our Grievance Officer at the address below. We will respond within 7 working days.

## 9. Cookies and local storage

We use cookies and browser local storage to keep you signed in, to remember your preferences (theme, filters, drafts), and to measure basic usage of the platform. We do not use third-party advertising cookies.

## 10. Children

Dream Edge is intended for students aged 10 and above. Children under 18 should only use the platform with parental consent. Parents may contact us at any time to review, correct, or delete their child's information.

## 11. Changes to this policy

We may update this policy as the platform evolves and as Indian privacy law develops. The effective date at the top of this page reflects the current version. Material changes will be communicated by email.

## 12. Grievance Officer

As required by the Information Technology (Reasonable Security Practices and Procedures) Rules, 2011 and the DPDP Act, our Grievance Officer can be reached at:

- **Email:** {{support_email}}
- **Address:** Dream IIT Institute, Kalmeshwar, Nagpur, Maharashtra, India.
$body$),

('terms', 'Terms of Service', '2026-10-22', $body$
These Terms of Service (“Terms”) govern your access to and use of Dream Edge Online — the website at dreamedgelearning.com and the Dream Edge mobile applications (collectively, the “Platform”), operated by Dream IIT Institute, Kalmeshwar, Nagpur. By creating an account, enrolling in a course, or otherwise using the Platform, you agree to these Terms.

## 1. Who can use Dream Edge

- You must be at least 10 years old to use the Platform.
- If you are under 18, a parent or legal guardian must read these Terms, create and manage the account on your behalf, and consent to any paid purchase.
- You agree to provide accurate information when creating your account and to keep that information up to date.
- One account per person. Sharing an account with other students — whether paid or free — is a breach of these Terms.

## 2. Account security and devices

You are responsible for keeping your password confidential and for every activity under your account. If you believe your account has been accessed by someone else, change your password and email us at once.

Each account may be signed in on up to two devices at the same time. Signing in from a third device will sign out the oldest session. We do this to prevent casual account sharing — not to inconvenience genuine users. If you change devices often (losing a phone, factory reset), write to us and we will help.

## 3. Courses, content, and intellectual property

- Every lesson, PDF, video, test question, worksheet, and image on the Platform is the intellectual property of Dream Edge or its licensors. You receive a limited, personal, non-transferable licence to view and use the content for your own learning.
- You may not download, screen-record, re-upload, re-share, or redistribute any Dream Edge content on YouTube, Telegram, WhatsApp, torrent sites, or any other platform. Doing so is grounds for immediate termination of your account without refund, and may expose you to civil and criminal liability under the Copyright Act, 1957 and the IT Act, 2000.
- You may download the printable notes and worksheets that we have explicitly marked as “downloadable” for your own personal use — not for sale or distribution.
- Any mock-test attempt, test answer, or feedback you submit may be used by us (anonymised) to improve the Platform.

## 4. Payments, pricing, and taxes

- All prices are shown in Indian Rupees (INR) and are inclusive of applicable GST unless stated otherwise.
- Payments are processed by Razorpay. By completing a payment, you also agree to Razorpay's terms and privacy policy.
- Course access is granted after Razorpay confirms the payment. In rare cases the confirmation can take a few minutes — if your account was debited but access was not granted within an hour, write to {{support_email}} with the Razorpay order ID.
- Each course has a stated validity period, which starts from the date of purchase. Access ends automatically when the validity expires.
- Prices and promotional discounts can change at any time. The price at the time of purchase is the price you pay.

## 5. Refunds

Our full refund policy is on a dedicated page: [Refund & Cancellation Policy](/refund-policy). In short, a full refund is available within 7 days of purchase if less than 20% of the course has been consumed.

## 6. Acceptable use

You agree not to:

- Share your account credentials with any other person.
- Record, copy, or redistribute Dream Edge content.
- Attempt to bypass paywalls, device limits, or any other technical protection on the Platform.
- Automate access with bots, scrapers, or scripts that place unusual load on our servers.
- Upload or submit any content that is unlawful, defamatory, obscene, or infringes anyone's rights, including in tests, messages, or support tickets.
- Harass, threaten, or impersonate any mentor, student, or Dream Edge staff.

## 7. Live classes

Live classes are held on the dates and times shown in your course schedule. Timings may change due to unforeseen circumstances — we'll notify you by push notification and email if that happens. Every live class is recorded, edited, and uploaded as a “rewatch” within 3–4 hours of the end of the class. Missing a live class is not grounds for a refund.

## 8. Certificates

Certificates issued at the end of a course or test are recognition of your participation and performance on the Dream Edge Platform. They are not government-issued qualifications or affiliated with any school board or university.

## 9. Service availability

We work hard to keep the Platform up at all times, but we do not guarantee uninterrupted service. Scheduled maintenance, third-party outages (Supabase, Razorpay, Vercel, R2), and force-majeure events may cause temporary downtime. If a planned live class is affected, we will reschedule.

## 10. Account suspension and termination

We may suspend or terminate your account, without refund, if you breach these Terms — in particular, if you share your account, redistribute content, or engage in fraudulent payments or chargeback abuse. We will give you written notice via email with the reason, and a chance to respond, unless the breach is so serious that immediate termination is necessary.

## 11. Disclaimers

The Platform is provided on an “as is” and “as available” basis. While we work hard to make our courses accurate and effective, we do not guarantee that any particular grade, rank, or exam outcome will follow from using Dream Edge. Learning depends on the student too.

## 12. Limitation of liability

To the maximum extent permitted by law, Dream Edge's total liability for any claim arising out of or relating to the Platform or your use of it shall not exceed the total amount you have paid to Dream Edge in the 12 months preceding the event giving rise to the claim. Dream Edge is not liable for indirect, incidental, consequential, or punitive damages.

## 13. Governing law and jurisdiction

These Terms are governed by the laws of India. Any dispute arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts at Nagpur, Maharashtra.

## 14. Changes to these Terms

We may update these Terms from time to time. If we make material changes, we'll notify you by email at the address on your account and give you at least 7 days before the changes take effect. Continued use of the Platform after that date means you accept the updated Terms.

## 15. Contact

Questions about these Terms: {{support_email}}.
$body$)
on conflict (slug) do nothing;
