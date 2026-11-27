import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DEMO, DISCORD_SIGN_IN, PASSWORD_SIGN_IN } from "@/config";
import { Skeleton } from "@/components/ui";
import { needsSetup } from "@/lib/account-store";
import { auth } from "@/lib/auth";
import { emailReady } from "@/lib/email";
import { loadSettings } from "@/lib/settings-store";
import { PasswordSignIn } from "./account-forms";
import { DemoLogin, DevLogin } from "./dev-login";
import { SignInShell } from "./shell";
import { SignInButton } from "./sign-in-button";
import { SignInError, SignInOrRetry } from "./sign-in-error";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  await loadSettings();
  return (
    <SignInShell intro="What our group plays, loves, and should play next.">
      {DEMO ? (
        <DemoLogin />
      ) : (
        <>
          <Suspense fallback={<Skeleton className="h-40 bg-black/20" />}>
            <WaysIn searchParams={props.searchParams} />
          </Suspense>
          <Suspense>
            <DevLogin />
          </Suspense>
        </>
      )}
    </SignInShell>
  );
}

/** Discord, a password, or both, as the group has set up. A new site without Discord is set up first */
async function WaysIn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  await connection();
  // Connecting Discord on Settings fails through here too (our own refusals come with a code), so
  // someone who's signed in goes back there to read why
  const { error } = await searchParams;
  if (typeof error === "string" && (await auth.api.getSession({ headers: await headers() }))) redirect(`/settings?error=${encodeURIComponent(error)}#email`);
  await loadSettings({ fresh: true });
  if (await needsSetup()) redirect("/setup");
  if (!PASSWORD_SIGN_IN) {
    return (
      <>
        <Suspense fallback={<SignInButton />}>
          <SignInOrRetry />
        </Suspense>
        <p className="mt-6 text-xs text-felt-ink/60">Only members of the group&apos;s Discord server can get in.</p>
      </>
    );
  }
  return (
    <>
      {DISCORD_SIGN_IN && (
        <>
          <Suspense fallback={<SignInButton />}>
            <SignInOrRetry />
          </Suspense>
          <p className="my-6 flex items-center gap-3 text-xs text-felt-ink/60 before:h-px before:flex-1 before:bg-felt-ink/25 after:h-px after:flex-1 after:bg-felt-ink/25">or</p>
        </>
      )}
      {!DISCORD_SIGN_IN && (
        <Suspense>
          <SignInError />
        </Suspense>
      )}
      <PasswordSignIn canReset={emailReady()} />
      <p className="mt-6 text-xs text-felt-ink/60">New here? Ask whoever runs the group for an invite.</p>
    </>
  );
}
