"use client";

import { useSearchParams } from "next/navigation";
import type { SignInRefusal } from "@/lib/sign-in-refusal";
import { SignInButton } from "./sign-in-button";

const MESSAGES: Record<SignInRefusal | "access_denied" | "account_not_linked", string> = {
  not_in_server: "That Discord account isn't in the group's server. Ask someone in the group for an invite, then try again.",
  missing_role: "Couldn't sign you in.",
  passwords_off: "This site doesn't use passwords. Sign in with Discord.",
  access_denied: "Sign-in was canceled in Discord.",
  account_not_linked: "There's already an account here with that email. Sign in with your password, then connect Discord on Settings.",
};

/** Why the last attempt failed, in words. Failed attempts come back as ?error=<code> */
function useProblem() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return Object.hasOwn(MESSAGES, error) ? MESSAGES[error as keyof typeof MESSAGES] : "Sign-in didn't finish.";
}

export function SignInError() {
  const problem = useProblem();
  return problem && <p role="alert" className="mb-4 rounded-lg bg-black/20 px-3 py-2 text-sm">{problem}</p>;
}

/** Discord's sign-in button, with why the last attempt failed above it */
export function SignInOrRetry() {
  const problem = useProblem();
  return (
    <>
      <SignInError />
      <SignInButton label={problem ? "Try again with Discord" : undefined} />
    </>
  );
}
