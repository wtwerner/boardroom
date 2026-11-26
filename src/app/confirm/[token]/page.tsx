import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { readLink } from "@/lib/account-store";
import { loadSettings } from "@/lib/settings-store";
import { ConfirmForm } from "../../sign-in/account-forms";
import { Notice, SignInShell } from "../../sign-in/shell";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmPage(props: PageProps<"/confirm/[token]">) {
  await loadSettings();
  return (
    <SignInShell>
      <Suspense>
        <Confirm params={props.params} />
      </Suspense>
    </SignInShell>
  );
}

async function Confirm({ params }: Pick<PageProps<"/confirm/[token]">, "params">) {
  const { token } = await params;
  await connection();
  await loadSettings({ fresh: true });
  const { link, problem } = await readLink("email", token);
  if (!link) return <Notice>{problem}</Notice>;
  return (
    <>
      <p className="mb-6 text-felt-ink/75">Confirm {link.email} as your email address.</p>
      <ConfirmForm token={token} />
    </>
  );
}
