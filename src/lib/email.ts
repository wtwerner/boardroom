import "server-only";
import { createTransport } from "nodemailer";
import { EMAIL } from "@/config";
import type { Email } from "./email-message";

/** Whether the site can email people (SMTP_URL and EMAIL_FROM) */
export const emailReady = () => EMAIL !== null;

let transport: ReturnType<typeof createTransport> | undefined;

/**
 * Send one email. Never throws: an event still changes, and an invite still works, when the mail
 * server doesn't. Returns whether it was accepted.
 */
export async function sendEmail(to: string, email: Email): Promise<boolean> {
  if (!EMAIL) return false;
  try {
    transport ??= createTransport(EMAIL.smtpUrl);
    await transport.sendMail({ from: EMAIL.from, to, ...email });
    return true;
  } catch (err) {
    // Not the address: logs aren't where people's emails should end up
    console.error(`Couldn't send "${email.subject}"`, err instanceof Error ? err.message.replaceAll(to, "(address)") : err);
    return false;
  }
}

/** Send several, a few at a time, so a small mail server isn't flooded */
export async function sendEmails(all: { to: string; email: Email }[]) {
  let sent = 0;
  for (let i = 0; i < all.length; i += 5) {
    const results = await Promise.all(all.slice(i, i + 5).map((m) => sendEmail(m.to, m.email)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}
