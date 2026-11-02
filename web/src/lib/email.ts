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
