"use client";

import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { type ActionResult, type EmailChoice, saveEmail, sendConfirmation, setEmailChoice } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/join";

const input = "w-full rounded-lg border border-line bg-table px-3 py-2 text-sm";

function Result({ state }: { state: ActionResult | null }) {
  if (!state || (state.ok && !state.message)) return null;
  return (
    <p role="status" className={clsx("text-sm", state.ok ? "text-slate" : "text-meeple-red")}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

/** The email they sign in with. Changing it asks for their password */
export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveEmail, null);
  const [value, setValue] = useState(email);
  const changed = value.trim().toLowerCase() !== email;
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">Email</span>
        <input name="email" type="email" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="username" required maxLength={200} className={input} />
        <span className="block text-xs text-slate">What you sign in with. The group doesn&apos;t see it.</span>
      </label>
      {changed && (
        <>
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">Your password</span>
            <input name="password" type="password" autoComplete="current-password" required maxLength={PASSWORD_MAX} className={input} />
          </label>
          <button disabled={pending} className={buttonClass("secondary")}>
            {pending ? "Saving…" : "Change email"}
          </button>
        </>
      )}
      <Result state={state} />
    </form>
  );
}

/** A new password, signing them out everywhere else */
export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
          Change password
        </button>
        <Result state={state} />
      </div>
    );
  }
  return (
    <form
      method="post"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setPending(true);
        const { error } = await authClient.changePassword({ currentPassword: String(form.get("current")), newPassword: String(form.get("next")), revokeOtherSessions: true });
        setPending(false);
        if (error) {
          setState({ ok: false, error: error.status === 429 ? "Too many tries. Wait a few seconds and try again." : error.code === "INVALID_PASSWORD" ? "That isn't your password." : "That didn't work. Try again in a minute." });
          return;
        }
        setState({ ok: true, message: "Changed. Anywhere else you were signed in is signed out." });
        setOpen(false);
      }}
    >
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">Your password now</span>
        <input name="current" type="password" autoComplete="current-password" required maxLength={PASSWORD_MAX} className={input} />
      </label>
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">New password</span>
        <input name="next" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} className={input} />
        <span className="block text-xs text-slate">At least {PASSWORD_MIN} characters. A few words work well.</span>
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Change password"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** For someone who joined without Discord, once the group has it */
export function ConnectDiscord() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate">In the group&apos;s Discord server? Connect it to be tagged on posts, use their buttons and sign in with it.</p>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("secondary")}
        onClick={async () => {
          setPending(true);
          const { error: failed } = await authClient.linkSocial({ provider: "discord", callbackURL: "/settings#email", errorCallbackURL: "/sign-in" });
          if (failed) {
            setPending(false);
            setError("Discord didn't open. Try again in a minute.");
          }
        }}
      >
        {pending ? "Opening Discord…" : "Connect Discord"}
      </button>
      {error && <Result state={{ ok: false, error }} />}
    </div>
  );
}

/** Whether I get emails about events. Someone Discord reaches picks between it alone, it and email, or no email at all */
export function EmailUpdates({ on, too, discord, email }: { on: boolean; too: boolean; /** Events reach them in Discord */ discord: boolean; email: string }) {
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<EmailChoice>(!on ? "off" : too ? "both" : "discord");
  const choose = (next: EmailChoice) => {
    const was = choice;
    setChoice(next);
    start(async () => {
      if (!(await setEmailChoice(next)).ok) setChoice(was);
    });
  };
  if (!discord) {
    return (
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={choice !== "off"} disabled={pending} onChange={(e) => choose(e.target.checked ? "discord" : "off")} className="mt-0.5 size-4 accent-[var(--felt)]" />
        <span>
          <span className="block text-sm font-medium">Email me about events</span>
          <span className="block text-xs text-slate">New events, date polls, changes and reminders, sent to {email}.</span>
        </span>
      </label>
    );
  }
  const options: { value: EmailChoice; label: string; hint: string }[] = [
    { value: "discord", label: "Discord", hint: "Email only when Discord can't reach you, for example if your DMs are off." },
    { value: "both", label: "Discord and email", hint: `Also send everything to ${email}.` },
    { value: "off", label: "Discord only", hint: "Never email me." },
  ];
  return (
    <fieldset className="space-y-2" disabled={pending}>
      <legend className="mb-1 text-sm font-medium">Event notifications</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-3">
          <input type="radio" name="email-choice" checked={choice === o.value} onChange={() => choose(o.value)} className="mt-0.5 size-4 accent-[var(--felt)]" />
          <span>
            <span className="block text-sm">{o.label}</span>
            <span className="block text-xs text-slate">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** For someone who signs in with Discord, the address is Discord's. `password`: they can sign in with one too */
export function ConfirmEmail({ email, password }: { email: string; password: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate">
        Confirm <strong className="font-medium text-ink">{email}</strong> to get emails about events{password && " and to be able to reset your password"}.
      </p>
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await sendConfirmation()))} className={buttonClass("secondary")}>
        {pending ? "Sending…" : "Send confirmation email"}
      </button>
      <Result state={state} />
    </div>
  );
}
