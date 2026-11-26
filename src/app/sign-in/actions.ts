"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { APIError } from "better-auth/api";
import { DEMO } from "@/config";
import { acceptInvite, choosePassword, confirmEmailFrom, sendPasswordReset, setupSite } from "@/lib/account-store";
import { stopEmails } from "@/lib/email-stop-store";
import { auth } from "@/lib/auth";
import { EmailInput, JoinInput, PasswordInput } from "@/lib/join";
import { loadSettings } from "@/lib/settings-store";

/**
 * What someone who isn't signed in can do: set up a new site, make an account from an invite,
 * and choose a new password or confirm an email from a link. There's nobody to check, so each
 * goes by what it was given: the site's setup code, or a link's token (account-store.ts).
 */

export type SignInResult = { ok: true; message: string } | { ok: false; error: string };

const failed = (err: unknown): SignInResult => {
  const message = err instanceof Error ? err.message : "";
  const internal = !message || message.startsWith("Failed query") || message.length > 200 || /SQLITE_|constraint/i.test(message);
  if (internal) console.error("Account action failed", err);
  return { ok: false, error: internal ? "Something went wrong. Try again in a minute." : message };
};

/** Fresh settings (whether the group uses passwords), and never on a demo, which has no accounts of its own */
async function ready() {
  await loadSettings({ fresh: true });
  if (DEMO) throw new Error("The demo doesn't have accounts. Pick someone to be on the sign-in page.");
}

/** Signed in as soon as the account's made or the password chosen, with the same checks as signing in */
async function signIn(email: string, password: string) {
  await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
}

const fields = (form: FormData) => JoinInput.safeParse({ name: form.get("name") ?? "", email: form.get("email") ?? "", password: form.get("password") ?? "" });

export async function setUpSite(_prev: SignInResult | null, form: FormData): Promise<SignInResult> {
  try {
    await ready();
    const parsed = fields(form);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    await setupSite(parsed.data, String(form.get("code") ?? ""));
    await signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    return failed(err);
  }
  redirect("/settings/group");
}

export async function joinGroup(token: string, _prev: SignInResult | null, form: FormData): Promise<SignInResult> {
  try {
    await ready();
    const parsed = fields(form);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    await acceptInvite(token, parsed.data);
    await signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    return failed(err);
  }
  redirect("/welcome");
}

export async function setPassword(token: string, _prev: SignInResult | null, form: FormData): Promise<SignInResult> {
  try {
    await ready();
    const parsed = PasswordInput.safeParse({ password: form.get("password") ?? "" });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const given = String(form.get("email") ?? "");
    const email = given ? EmailInput.safeParse({ email: given }) : null;
    if (email && !email.success) return { ok: false, error: email.error.issues[0].message };
    await signIn(await choosePassword(token, parsed.data.password, email?.data.email ?? null), parsed.data.password);
  } catch (err) {
    // The password is set either way; someone who can't sign in is told why by the sign-in page
    if (!(err instanceof APIError)) return failed(err);
  }
  redirect("/");
}

export async function forgotPassword(_prev: SignInResult | null, form: FormData): Promise<SignInResult> {
  try {
    await ready();
    const parsed = EmailInput.safeParse({ email: form.get("email") ?? "" });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    // After the answer, which is the same (and takes as long) whether or not there's an account
    after(() => sendPasswordReset(parsed.data.email).catch((err) => console.error("Couldn't send a password reset", err)));
  } catch (err) {
    return failed(err);
  }
  return { ok: true, message: "If that email belongs to an account and has been confirmed, we've sent a reset link. If it doesn't arrive in a few minutes, ask a group admin for a link." };
}

export async function confirmEmail(token: string): Promise<SignInResult> {
  try {
    await ready();
    await confirmEmailFrom(token);
  } catch (err) {
    return failed(err);
  }
  return { ok: true, message: "Your email is confirmed." };
}

/** From an email's stop link: the signed key says whose emails, so it works without signing in */
export async function stopEmailsFrom(key: string): Promise<SignInResult> {
  try {
    if (!(await stopEmails(key))) return { ok: false, error: "This unsubscribe link isn't valid. Sign in and turn off emails in Settings." };
  } catch (err) {
    return failed(err);
  }
  return { ok: true, message: "You're unsubscribed from event emails. You can turn them back on in Settings." };
}
