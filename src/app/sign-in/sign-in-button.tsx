"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { buttonClass } from "@/components/ui";

export function SignInButton({ label = "Sign in with Discord" }: { label?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("secondary", "w-full py-3 text-base")}
      onClick={async () => {
        setPending(true);
        // Someone signing in for the first time starts on the setup page
        await authClient.signIn.social({ provider: "discord", callbackURL: "/", newUserCallbackURL: "/welcome", errorCallbackURL: "/sign-in" });
      }}
    >
      <DiscordMark />
      {pending ? "Opening Discord…" : label}
    </button>
  );
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-[#5865F2]" aria-hidden>
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.8 19.8 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.1-.9-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}
