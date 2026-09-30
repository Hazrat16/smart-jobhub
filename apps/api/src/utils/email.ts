import dotenv from "dotenv";
import { Resend } from "resend";
dotenv.config(); // ensure .env is loaded if it wasn't already

dotenv.config(); // ensure .env is loaded if it wasn't already

const resend = new Resend(process.env["RESEND_API_KEY"]);

const RESEND_TEST_EMAIL =
  process.env["RESEND_TEST_EMAIL"] || "hazrat17016@gmail.com";
const IS_DEV =
  process.env["NODE_ENV"] === "development" || !process.env["NODE_ENV"];

// Read per call (not at import) so tests and late-loaded env vars work.
// Resend's onboarding@resend.dev sender only delivers to the account owner; set
// EMAIL_FROM to an address on a domain verified in Resend for real users.
const emailFrom = () => process.env["EMAIL_FROM"] || "Job Platform <onboarding@resend.dev>";

/** Public link for the verify-email endpoint (API_PUBLIC_BASE_URL is the site's URL in AWS). */
export function verificationLink(token: string): string {
  const base = (process.env["API_PUBLIC_BASE_URL"] || "http://localhost:5000").replace(/\/+$/, "");
  return `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

const getEffectiveRecipient = (requestedTo: string) => {
  if (IS_DEV) {
    return RESEND_TEST_EMAIL;
  }
  return requestedTo;
};

export const sendVerificationEmail = async (to: string, token: string) => {
  const link = verificationLink(token);
  const effectiveTo = getEffectiveRecipient(to);
  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom(),
      to: effectiveTo,
      subject: "Verify your email",
      html: `<p>Please verify your email by clicking <a href="${link}">this link</a>.</p>${
        effectiveTo !== to
          ? `<p><strong>Requested recipient:</strong> ${to}</p>`
          : ""
      }`,
    });

    if (error) {
      console.error("Error sending email:", error);
      return false;
    }

    console.log("Verification email sent", data);
    return true;
  } catch (err) {
    console.error("Failed to send email", err);
    return false;
  }
};

export const sendResetPasswordEmail = async (to: string, link: string) => {
  const effectiveTo = getEffectiveRecipient(to);
  try {
    const { error, data } = await resend.emails.send({
      from: emailFrom(),
      to: effectiveTo,
      subject: "Reset your password",
      html: `<p>You requested a password reset. Click <a href="${link}">here</a> to reset your password. This link will expire in 1 hour.</p>${
        effectiveTo !== to
          ? `<p><strong>Requested recipient:</strong> ${to}</p>`
          : ""
      }`,
    });

    if (error) {
      console.error("❌ Resend email error:", error);
      return false;
    }

    console.log("✅ Reset email sent:", data);
    return true;
  } catch (error) {
    console.error("❌ Unexpected error sending reset email:", error);
    return false;
  }
};
