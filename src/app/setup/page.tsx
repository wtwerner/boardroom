import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { asksForCode, needsSetup } from "@/lib/account-store";
import { loadSettings } from "@/lib/settings-store";
import { SetupForm } from "../sign-in/account-forms";
import { SignInShell } from "../sign-in/shell";

export const metadata: Metadata = { title: "Set up the site", robots: { index: false, follow: false } };

/** A new site without Discord: whoever put it up makes the first account, which is its admin */
export default async function SetupPage() {
  await loadSettings();
  return (
    <SignInShell intro="This site is brand new. Make your account first, then you can name the site and invite the group.">
      <Suspense>
        <Setup />
      </Suspense>
    </SignInShell>
  );
}

async function Setup() {
  await connection();
  await loadSettings({ fresh: true });
  if (!(await needsSetup())) redirect("/sign-in");
  return <SetupForm asksCode={asksForCode()} />;
}
