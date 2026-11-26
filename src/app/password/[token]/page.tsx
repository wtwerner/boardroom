import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { passwordLinkFor } from "@/lib/account-store";
import { loadSettings } from "@/lib/settings-store";
import { PasswordForm } from "../../sign-in/account-forms";
import { Notice, SignInShell } from "../../sign-in/shell";

export const metadata: Metadata = { title: "Choose a password", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Where a password link goes, whether an admin sent it or it was emailed */
export default async function PasswordPage(props: PageProps<"/password/[token]">) {
  await loadSettings();
  return (
    <SignInShell>
      <Suspense>
        <ChoosePassword params={props.params} />
      </Suspense>
    </SignInShell>
  );
}

async function ChoosePassword({ params }: Pick<PageProps<"/password/[token]">, "params">) {
  const { token } = await params;
  await connection();
  await loadSettings({ fresh: true });
  const found = await passwordLinkFor(token);
  if (found.problem !== null) return <Notice>{found.problem}</Notice>;
  return (
    <>
      <p className="mb-6 text-felt-ink/75">Choose a new password for {found.user.name}. You&apos;ll be signed out on other devices.</p>
      <PasswordForm token={token} email={found.user.needsEmail ? null : found.user.email} />
    </>
  );
}
