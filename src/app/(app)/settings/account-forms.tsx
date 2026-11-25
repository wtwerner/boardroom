"use client";

import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { type ActionResult, saveEmail, sendConfirmation, setEmailUpdates } from "@/app/actions";
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

export function EmailUpdates({ on, discord, email }: { on: boolean; /** Events reach them in Discord */ discord: boolean; email: string }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(on);
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(async () => {
            const res = await setEmailUpdates(next);
            if (!res.ok) setChecked(!next);
          });
        }}
        className="mt-0.5 size-4 accent-[var(--felt)]"
      />
      <span>
        <span className="block text-sm font-medium">Email me about events</span>
        <span className="block text-xs text-slate">
          New ones, dates to pick, changes and reminders, to {email}.{discord && " What you hear about in Discord isn't emailed too."}
        </span>
      </span>
    </label>
  );
}

export function ConfirmEmail({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate">
        Confirm <strong className="font-medium text-ink">{email}</strong> to get emails about events, and to get back in if you forget your password. The link was
        emailed to you.
      </p>
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await sendConfirmation()))} className={buttonClass("secondary")}>
        {pending ? "Sending…" : "Send it again"}
      </button>
      <Result state={state} />
    </div>
  );
}
