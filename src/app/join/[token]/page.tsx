import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { CASUAL_NIGHT, DEMO, NIGHT_NAMES, PASSWORD_SIGN_IN } from "@/config";
import { db, schema } from "@/db";
import { TextLink } from "@/components/ui";
import { readLink } from "@/lib/account-store";
import { auth } from "@/lib/auth";
import { loadSettings } from "@/lib/settings-store";
import { inSentence } from "@/lib/text";
import { JoinForm } from "../../sign-in/account-forms";
import { Notice, SignInShell } from "../../sign-in/shell";

export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Where an invite goes. Opening it uses nothing up: chats open links to preview them */
export default async function JoinPage(props: PageProps<"/join/[token]">) {
  await loadSettings();
  return (
    <SignInShell>
      <Suspense>
        <Join params={props.params} />
      </Suspense>
    </SignInShell>
  );
}

async function Join({ params }: Pick<PageProps<"/join/[token]">, "params">) {
  const { token } = await params;
  await connection();
  await loadSettings({ fresh: true });
  if (DEMO) redirect("/sign-in");
  // Someone with an account already doesn't need another, which is easy to make by tapping the group's link again
  if (await auth.api.getSession({ headers: await headers() })) {
    return (
      <Notice>
        You have an account here, and you&apos;re signed in. <TextLink href="/" className="text-felt-ink underline">Go to the site</TextLink>
      </Notice>
    );
  }
  const { link, problem } = await readLink("invite", token);
  if (!link || !PASSWORD_SIGN_IN || (link.access === "casual" && !CASUAL_NIGHT)) return <Notice>{problem ?? "That link was turned off. Ask for a new one."}</Notice>;
  const player = link.playerId ? await db.query.player.findFirst({ where: eq(schema.player.id, link.playerId), columns: { name: true } }) : null;
  return (
    <>
      <p className="mb-6 text-felt-ink/75">
        {link.access === "casual" ? `You're invited to the ${inSentence(NIGHT_NAMES.casual)}.` : "You're invited to the group."}{" "}
        {player ? `The games you've played as ${player.name} come with you.` : "Make an account to see what's planned and say if you're coming."}
      </p>
      <JoinForm token={token} name={player?.name ?? null} />
    </>
  );
}
