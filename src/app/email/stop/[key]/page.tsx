import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { stopLinkFor } from "@/lib/email-stop-store";
import { loadSettings } from "@/lib/settings-store";
import { StopEmailsForm } from "../../../sign-in/account-forms";
import { Notice, SignInShell } from "../../../sign-in/shell";

export const metadata: Metadata = { title: "Unsubscribe from event emails", robots: { index: false, follow: false }, referrer: "no-referrer" };

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
  if (!u) return <Notice>This unsubscribe link isn&apos;t valid. Sign in and turn off emails in Settings.</Notice>;
  if (!u.emailUpdates) return <p className="text-felt-ink/75">{u.email} is already unsubscribed from event emails. You can turn them back on in Settings.</p>;
  return (
    <>
      <p className="mb-6 text-felt-ink/75">Unsubscribe {u.email} from event emails? Events will still be on the site.</p>
      <StopEmailsForm stopKey={key} />
    </>
  );
}
