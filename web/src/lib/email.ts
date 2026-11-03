/**
 * Transactional email, through Resend.
 *
 * Deliberately a `fetch` against Resend's REST API rather than the SDK: one
 * POST does not need a dependency, and the API key is read at call time so a
 * deployment without one does not fail at import.
 *
 * Nothing is wired up yet — `RESEND_API_KEY` is not set on any environment.
 * Rather than pretend, every caller gets back whether the message actually
 * left, and the UI says so. The panel that offers to email a student their
 * password link also shows the link, which is what an admin standing next to
 * the student wants anyway.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The From address. Must be a verified domain in the Resend account. */
const FROM = "Dream Edge <noreply@dreamedgelearning.com>";

export type EmailOutcome =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed"; detail?: string };

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return { sent: false, reason: "not_configured" };
  }

  // A synthetic address belongs to a student who has no email; sending to it
  // would bounce and, worse, count against the domain's reputation.
  if (/@(phone|user)\.dreamedge\.local$/i.test(options.to)) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[email] Resend refused the message:", response.status, detail);
      return { sent: false, reason: "failed", detail: `${response.status}` };
    }

    return { sent: true };
  } catch (error) {
    console.error("[email] could not reach Resend:", error);
    return { sent: false, reason: "failed" };
  }
}

/** Escapes a value that is about to be dropped into an HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The "set your password" mail a student gets after being registered at the
 * centre. Plain and short on purpose: it is read on a phone, often by a
 * parent, and the only thing that matters is the button.
 */
export function passwordSetupEmail(options: {
  fullName: string;
  studentCode: string | null;
  link: string;
}): { subject: string; html: string } {
  const name = escapeHtml(options.fullName.split(" ")[0] || "there");
  const code = options.studentCode ? escapeHtml(options.studentCode) : null;

  return {
    subject: "Set your Dream Edge password",
    html: `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16223B">
  <div style="background:#16223B;padding:18px 22px;border-radius:10px 10px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px">DREAM EDGE</span>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 10px 10px;padding:22px">
    <p style="margin:0 0 14px">Hello ${name},</p>
    <p style="margin:0 0 14px">
      Your Dream Edge account has been created at the Kalmeshwar centre. Set a
      password to sign in on the website and the app.
    </p>
    <p style="margin:0 0 22px">
      <a href="${escapeHtml(options.link)}"
         style="background:#F26A21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">
        Set my password
      </a>
    </p>
    ${
      code
        ? `<p style="margin:0 0 14px;font-size:14px">
             Your student code is <strong style="letter-spacing:1px">${code}</strong>.
             Keep it for receipts and enquiries.
           </p>`
        : ""
    }
    <p style="margin:0;font-size:13px;color:#8892A0">
      This link expires in 24 hours. If it has, ask the centre for a new one.
    </p>
  </div>
</div>`.trim(),
  };
}

/**
 * The mail a super admin gets when somebody applies for admin access.
 *
 * Short on purpose: the decision needs the panel, not the email. All this has
 * to do is say who applied and get them there.
 */
export function adminApplicationEmail(options: {
  applicantName: string;
  roleLabel: string;
  experienceYears: number;
  link: string;
}): { subject: string; html: string } {
  const name = escapeHtml(options.applicantName);
  const role = escapeHtml(options.roleLabel);
  const years = options.experienceYears;

  return {
    subject: `New admin application — ${name} (${role})`,
    html: `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16223B">
  <div style="background:#16223B;padding:18px 22px;border-radius:10px 10px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px">DREAM EDGE</span>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 10px 10px;padding:22px">
    <p style="margin:0 0 14px"><strong>${name}</strong> has applied for admin access.</p>
    <p style="margin:0 0 18px;font-size:14px">
      Applying as <strong>${role}</strong> &middot; ${years} year${years === 1 ? "" : "s"} of experience
    </p>
    <p style="margin:0 0 22px">
      <a href="${escapeHtml(options.link)}"
         style="background:#F26A21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">
        Review the application
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#8892A0">
      They have no access to anything until you approve them.
    </p>
  </div>
</div>`.trim(),
  };
}

/**
 * The mail an approved applicant gets. Carries the set-your-own-password link,
 * so it is the only thing standing between approval and a working account --
 * which is why the approval panel shows the same link on screen.
 */
export function adminApprovedEmail(options: {
  fullName: string;
  roleLabel: string;
  link: string;
}): { subject: string; html: string } {
  const name = escapeHtml(options.fullName.split(" ")[0] || "there");
  const role = escapeHtml(options.roleLabel);

  return {
    subject: "Your Dream Edge admin access is approved",
    html: `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16223B">
  <div style="background:#16223B;padding:18px 22px;border-radius:10px 10px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px">DREAM EDGE</span>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 10px 10px;padding:22px">
    <p style="margin:0 0 14px">Hello ${name},</p>
    <p style="margin:0 0 14px">
      Your application has been approved. You have been added to the Dream Edge
      team as <strong>${role}</strong>.
    </p>
    <p style="margin:0 0 22px">
      <a href="${escapeHtml(options.link)}"
         style="background:#F26A21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">
        Set my password
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#8892A0">
      This link expires in 24 hours. If it has, ask for a new one.
    </p>
  </div>
</div>`.trim(),
  };
}

/**
 * The mail a rejected applicant gets. A reason is optional and included only
 * when one was written, rather than padded with a stock sentence.
 */
export function adminRejectedEmail(options: {
  fullName: string;
  reason?: string | null;
}): { subject: string; html: string } {
  const name = escapeHtml(options.fullName.split(" ")[0] || "there");
  const reason = options.reason?.trim();

  return {
    subject: "About your Dream Edge application",
    html: `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16223B">
  <div style="background:#16223B;padding:18px 22px;border-radius:10px 10px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px">DREAM EDGE</span>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 10px 10px;padding:22px">
    <p style="margin:0 0 14px">Hello ${name},</p>
    <p style="margin:0 0 14px">
      Thank you for applying to join the Dream Edge team. We are not taking
      your application forward at this time.
    </p>
    ${
      reason
        ? `<p style="margin:0 0 14px;padding:12px 14px;background:#F6F7F9;border-radius:8px;font-size:14px">${escapeHtml(
            reason
          )}</p>`
        : ""
    }
    <p style="margin:0;font-size:13px;color:#8892A0">
      You are welcome to apply again later.
    </p>
  </div>
</div>`.trim(),
  };
}
