import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_NAME } from "@/config";
import { Meeple } from "@/components/ui";
import { SignInButton } from "./sign-in-button";
import { SignInOrRetry } from "./sign-in-error";
import { DevLogin } from "./dev-login";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-felt px-4 text-felt-ink">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center gap-1.5" aria-hidden>
          {(["red", "blue", "yellow", "green", "purple"] as const).map((c, i) => (
            <Meeple key={c} color={c} className={i === 2 ? "size-10 -translate-y-1" : "size-8"} />
          ))}
        </div>
        <h1 className="font-display text-5xl">{SITE_NAME}</h1>
        <p className="mt-3 text-felt-ink/75">What our group plays, loves, and should play next.</p>
        <div className="mt-8">
          <Suspense fallback={<SignInButton />}>
            <SignInOrRetry />
          </Suspense>
        </div>
        <p className="mt-6 text-xs text-felt-ink/60">Only members of the group&apos;s Discord server can get in.</p>
        <Suspense>
          <DevLogin />
        </Suspense>
      </div>
    </main>
  );
}
