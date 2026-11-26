"use client";

import { type ReactNode, useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/join";
import { type SignInResult, confirmEmail, forgotPassword, joinGroup, setPassword, setUpSite, stopEmailsFrom } from "./actions";

const input = "w-full rounded-lg border border-felt-ink/40 bg-black/20 px-3 py-2.5 text-base text-felt-ink placeholder:text-felt-ink/50";

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-left">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-felt-ink/70">{hint}</span>}
    </label>
  );
}

function Said({ state }: { state: SignInResult | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className="rounded-lg bg-black/20 px-3 py-2 text-left text-sm">
      {state.ok ? state.message : state.error}
    </p>
  );
}

function Submit({ pending, children, busy }: { pending: boolean; children: ReactNode; busy: string }) {
  return (
    <button disabled={pending} className={buttonClass("secondary", "w-full justify-center py-3 text-base")}>
      {pending ? busy : children}
    </button>
  );
}

const NewPassword = () => (
  <Field label="Password" hint={`At least ${PASSWORD_MIN} characters. A few words work well.`}>
    <input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} className={input} />
  </Field>
);

// A refused form keeps what was typed: React clears uncontrolled fields after an action, so these are controlled
function NameAndEmail({ name: given = "", emailHint }: { name?: string; emailHint?: string }) {
  const [name, setName] = useState(given);
  const [email, setEmail] = useState("");
  return (
    <>
      <Field label="Your name" hint="What the group calls you. You can change it later.">
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required maxLength={40} className={input} />
      </Field>
      <Field label="Email" hint={emailHint}>
        <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required maxLength={200} className={input} />
      </Field>
    </>
  );
}

/** The refusals worth their own words; anything else is the email or password */
const REFUSED: Record<string, string> = {
  passwords_off: "This site doesn't use passwords. Sign in with Discord.",
  missing_role: "Couldn't sign you in.",
  INVALID_ORIGIN: "This isn't the site's own address, so you can't sign in with a password here. The site's admin can check BETTER_AUTH_URL.",
};

export function PasswordSignIn({ canReset }: { canReset: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    // Sent before the page's scripts are ready, the browser submits it itself: as a post, so the password isn't in the address
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        const { error: failed } = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")) });
        if (!failed) {
          router.push("/");
          router.refresh();
          return;
        }
        setPending(false);
        setError(
          failed.status === 429
            ? "Too many tries. Wait a few seconds and try again."
            : failed.status >= 500
              ? "Something went wrong. Try again in a minute."
              : (REFUSED[failed.code ?? ""] ?? "That email and password don't match an account."),
        );
      }}
    >
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required className={input} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required maxLength={PASSWORD_MAX} className={input} />
      </Field>
      {error && <Said state={{ ok: false, error }} />}
      <Submit pending={pending} busy="Signing in…">
        Sign in
      </Submit>
      <p className="text-xs text-felt-ink/70">
        {canReset ? (
          <Link href="/sign-in/forgot" className="underline underline-offset-4">
            Forgot your password?
          </Link>
        ) : (
          "Forgot your password? One of the group's admins can make you a link."
        )}
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(forgotPassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required className={input} />
      </Field>
      <Said state={state} />
      <Submit pending={pending} busy="Sending…">
        Email me a link
      </Submit>
      <p className="text-xs text-felt-ink/70">
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function SetupForm({ asksCode }: { asksCode: boolean }) {
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(setUpSite, null);
  return (
    <form action={action} className="space-y-4">
      <NameAndEmail emailHint="To sign in with. Only you and the site see it." />
      <NewPassword />
      {asksCode && (
        <Field label="Setup code" hint="What you put in SETUP_CODE, so nobody else who finds the site can set it up first.">
          <input name="code" type="password" autoComplete="off" required className={input} />
        </Field>
      )}
      <Said state={state} />
      <Submit pending={pending} busy="Setting up…">
        Set up the site
      </Submit>
    </form>
  );
}

export function JoinForm({ token, name }: { token: string; name: string | null }) {
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(joinGroup.bind(null, token), null);
  return (
    <form action={action} className="space-y-4">
      <NameAndEmail name={name ?? undefined} emailHint="To sign in with. The group doesn't see it." />
      <NewPassword />
      <Said state={state} />
      <Submit pending={pending} busy="Joining…">
        Join
      </Submit>
      <p className="text-xs text-felt-ink/70">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function PasswordForm({ token, email }: { token: string; email: string | null }) {
  const [state, action, pending] = useActionState<SignInResult | null, FormData>(setPassword.bind(null, token), null);
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-4">
      {email ? (
        // Where a password manager looks for who this password is for
        <input type="email" autoComplete="username" value={email} readOnly className={input} aria-label="Email" />
      ) : (
        <Field label="Email" hint="Your Discord account didn't have one. You'll sign in with this.">
          <input name="email" type="email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="username" required maxLength={200} className={input} />
        </Field>
      )}
      <NewPassword />
      <Said state={state} />
      <Submit pending={pending} busy="Saving…">
        Save and sign in
      </Submit>
    </form>
  );
}

/** A button, not the link itself: mail programs open links to check them */
export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SignInResult | null>(() => confirmEmail(token), null);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Said state={state} />
        <Link href="/" className={buttonClass("secondary", "w-full justify-center py-3 text-base")}>
          Go to the site
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <Said state={state} />
      <Submit pending={pending} busy="Confirming…">
        Confirm my email
      </Submit>
    </form>
  );
}

/** A button, not the link itself: mail programs open links to check them */
export function StopEmailsForm({ stopKey }: { stopKey: string }) {
  const [state, action, pending] = useActionState<SignInResult | null>(() => stopEmailsFrom(stopKey), null);
  if (state?.ok) return <Said state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Said state={state} />
      <Submit pending={pending} busy="Stopping…">
        Stop emails about events
      </Submit>
    </form>
  );
}
