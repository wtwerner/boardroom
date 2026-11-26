import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PASSWORD_SIGN_IN } from "@/config";
import { emailReady } from "@/lib/email";
import { loadSettings } from "@/lib/settings-store";
import { ForgotForm } from "../account-forms";
import { SignInShell } from "../shell";

export const metadata: Metadata = { title: "Forgot your password" };

export default async function ForgotPage() {
  await loadSettings();
  return (
    <SignInShell intro="Enter the email you sign in with, and we'll send you a link to reset your password.">
      <Suspense>
        <Forgot />
      </Suspense>
    </SignInShell>
  );
}

async function Forgot() {
  await connection();
  await loadSettings({ fresh: true });
  if (!PASSWORD_SIGN_IN || !emailReady()) redirect("/sign-in");
  return <ForgotForm />;
}
