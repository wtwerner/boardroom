"use client";

import { useSearchParams } from "next/navigation";
import type { SignInRefusal } from "@/lib/sign-in-refusal";
import { SignInButton } from "./sign-in-button";

const MESSAGES: Record<SignInRefusal | "access_denied", string> = {
  not_in_server: "That Discord account isn't in the group's server. Ask someone in the group for an invite, then try again.",
  missing_role: "Couldn't sign you in with that Discord account.",
  access_denied: "Sign-in was canceled in Discord.",
};

/** The sign-in button, with why the last attempt failed above it. Failed attempts come back as ?error=<code>. */
export function SignInOrRetry() {
  const error = useSearchParams().get("error");
  if (!error) return <SignInButton />;
  const message = Object.hasOwn(MESSAGES, error) ? MESSAGES[error as keyof typeof MESSAGES] : "Discord sign-in didn't finish.";
  return (
    <>
      <p role="alert" className="mb-4 rounded-lg bg-black/20 px-3 py-2 text-sm">{message}</p>
      <SignInButton label="Try again" />
    </>
  );
}
