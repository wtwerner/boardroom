import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, count, eq } from "drizzle-orm";
import { DEMO, DISCORD_BOT, DISCORD_SIGN_IN, SETTINGS } from "@/config";
import { db, schema } from "@/db";
import { DemoNote, PageHeader, Panel, Section, Skeleton } from "@/components/ui";
import { hasAnthropicKey } from "@/lib/ai";
import { emailReady } from "@/lib/email";
import { hasInteractions, listGuildChannels, listGuildRoles } from "@/lib/discord";
import { canManageGroup, requireMemberPage } from "@/lib/session";
import { AdminList, GroupSettingsForm } from "./group-forms";

export const metadata: Metadata = { title: "Group settings" };

export default function GroupSettingsPage() {
  return (
    <>
      <PageHeader title="Group settings" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <GroupSettings />
      </Suspense>
    </>
  );
}

async function GroupSettings() {
  const me = await requireMemberPage();
  const discord = DISCORD_BOT;
  const [canManage, members, [saved], channels, roles] = await Promise.all([
    canManageGroup(),
    // Everyone who has signed in
    db
      .select({ id: schema.user.id, name: schema.user.name, isAdmin: schema.user.isAdmin })
      .from(schema.user)
      .where(eq(schema.user.access, "member"))
      .orderBy(asc(schema.user.name)),
    db.select({ n: count() }).from(schema.setting),
    discord ? listGuildChannels() : [],
    discord ? listGuildRoles() : [],
  ]);
  const admins = members.filter((m) => m.isAdmin);

  if (!canManage) {
    return (
      <p className="max-w-2xl text-sm text-slate">
        Only the group&apos;s admins can change these: {admins.map((a) => a.name).join(", ")}.{" "}
        <Link href="/settings" className="text-accent underline-offset-4 hover:underline">Back to settings</Link>
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-10">
      {DEMO && (
        <DemoNote>You can&apos;t change these on the demo, since everyone trying it shares one group. On your own group&apos;s site, admins can.</DemoNote>
      )}
      {!admins.length && (
        <p role="note" className="rounded-xl border border-meeple-yellow/60 bg-meeple-yellow/10 px-4 py-3 text-sm">
          <strong>Nobody&apos;s an admin yet</strong>, so every member can change these. Make yourself an admin below and only admins can.
        </p>
      )}
      {!saved.n && !DEMO && (
        <p className="text-sm text-slate">
          {DISCORD_BOT
            ? "These start from the site's environment variables. Once you save here, the site uses what's saved instead, and the variables can go."
            : "Start with the group's name and time zone, then invite everyone from People and access, on Settings."}
        </p>
      )}

      <GroupSettingsForm
        settings={SETTINGS}
        timeZones={["UTC", ...Intl.supportedValuesOf("timeZone").filter((tz) => tz !== "UTC")]}
        claude={hasAnthropicKey()}
        discord={discord ? { channels, roles, interactions: hasInteractions() } : null}
        site={{ discordSignIn: DISCORD_SIGN_IN, email: emailReady() }}
        readOnly={DEMO}
      />

      <Section id="admins" title="Admins" className="scroll-mt-6">
        <p className="mb-3 text-sm text-slate">Admins can change everything on this page, and make other members admins.</p>
        <Panel className="p-4">
          <AdminList members={members} meId={me.id} readOnly={DEMO} />
        </Panel>
      </Section>
    </div>
  );
}
