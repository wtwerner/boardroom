import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { stopLinkFor } from "@/lib/email-stop-store";
import { loadSettings } from "@/lib/settings-store";
import { StopEmailsForm } from "../../../sign-in/account-forms";
import { Notice, SignInShell } from "../../../sign-in/shell";

export const metadata: Metadata = { title: "Stop emails about events", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** From the link at the bottom of an email about an event: works without signing in, and asks before it does anything */
export default async function StopEmailsPage(props: PageProps<"/email/stop/[key]">) {
  await loadSettings();
  return (
    <SignInShell>
      <Suspense>
        <Stop params={props.params} />
      </Suspense>
    </SignInShell>
  );
}

async function Stop({ params }: Pick<PageProps<"/email/stop/[key]">, "params">) {
  const { key } = await params;
  await connection();
  const u = await stopLinkFor(key);
  if (!u) return <Notice>This link doesn&apos;t work. Sign in and turn emails off in Settings instead.</Notice>;
  if (!u.emailUpdates) return <p className="text-felt-ink/75">Event emails to {u.email} are already off. You can turn them back on in Settings.</p>;
  return (
    <>
      <p className="mb-6 text-felt-ink/75">Stop sending event emails to {u.email}? Everything will still be on the site.</p>
      <StopEmailsForm stopKey={key} />
    </>
  );
}
