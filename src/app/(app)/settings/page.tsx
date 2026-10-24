import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader, Panel, Section, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getPlayers } from "@/lib/queries";
import { hasBggToken } from "@/lib/bgg";
import { anyServerMemberCanSignIn, listGuildMembers } from "@/lib/discord";
import { BgaForm, BggForm, ColorPicker, CsvForm, MergePlayersForm, PlayerDiscordLink, RenamePlayerForm, SignOutButton, SplitPlayerForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const me = await requireUser();
  const [players, [owned], seatCounts, discordMembers, [bga]] = await Promise.all([
    getPlayers(),
    db
      .select({ n: count() })
      .from(schema.collectionItem)
      .where(eq(schema.collectionItem.userId, me.id)),
    db
      .select({ playerId: schema.playPlayer.playerId, n: count() })
      .from(schema.playPlayer)
      .groupBy(schema.playPlayer.playerId),
    listGuildMembers(),
    db
      .select({ username: schema.user.bgaUsername, premium: schema.user.bgaPremium })
      .from(schema.user)
      .where(eq(schema.user.id, me.id)),
  ]);
  const plays = new Map(seatCounts.map((s) => [s.playerId, s.n]));
  const takenColors = players.filter((p) => p.id !== me.playerId && p.color).map((p) => p.color!);

  return (
    <div className="max-w-2xl space-y-10">
      {anyServerMemberCanSignIn() && (
        <p role="note" className="rounded-xl border border-meeple-yellow/60 bg-meeple-yellow/10 px-4 py-3 text-sm">
          <strong>Anyone in the Discord server can sign in here</strong>, and everyone who signs in can edit and delete plays. That&apos;s fine
          if the server is just your group. If it isn&apos;t, give the group a role and set <code className="text-xs">DISCORD_MEMBER_ROLE_ID</code> to
          it.
        </p>
      )}
      <p className="text-sm text-slate">
        New here, or missing something? The <Link href="/welcome" className="text-accent underline-offset-4 hover:underline">setup guide</Link> walks
        through rating, ranking and connecting BGG and Board Game Arena.
      </p>
      <Section title="You">
        {me.playerId && (
          <div className="mb-5">
            <p className="mb-2 text-sm text-slate">The name everyone sees on plays and rankings. It starts as your Discord name.</p>
            <RenamePlayerForm players={[{ id: me.playerId, name: me.name }]} myPlayerId={me.playerId} label="Your name" />
          </div>
        )}
        <p className="mb-3 text-sm text-slate">Your meeple color marks you everywhere on the site.</p>
        <ColorPicker current={me.color} taken={takenColors} />
      </Section>

      <Section id="bgg" title="BoardGameGeek collection" className="scroll-mt-6">
        <Panel className="space-y-5 p-4">
          <div>
            <BggForm username={me.bggUsername} />
            <p className="mt-2 text-xs text-slate">
              {owned.n ? `${owned.n} games from your collection are on the shared shelf. ` : ""}
              {hasBggToken() ? "Collections re-sync every night." : "Automatic syncing starts once the site's BGG API token is set up. Until then, use the CSV import."}
            </p>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Import a CSV instead</h3>
            <p className="mt-1 mb-3 text-xs text-slate">
              On BGG, open your collection, choose <em>Download</em> (under the table options), then upload the file here. This replaces your current shelf entries.
            </p>
            <CsvForm />
          </div>
        </Panel>
      </Section>

      <Section id="bga" title="Board Game Arena" className="scroll-mt-6">
        <Panel className="p-4">
          <BgaForm username={bga?.username ?? null} premium={bga?.premium ?? false} />
          <p className="mt-2 text-xs text-slate">
            Shown on the <Link href="/online" className="text-accent underline-offset-4 hover:underline">Online</Link> page so the others can find you
            there. Only whoever opens a table needs Premium for a Premium game.
          </p>
        </Panel>
      </Section>

      <Section id="players" title="Players" className="scroll-mt-6">
        <p className="mb-3 text-sm text-slate">
          Everyone who appears in a play log. Link each person to their Discord account so plays posted from here tag them.
          Anyone @-mentioned in an imported message is linked already, and members are linked when they sign in.
        </p>
        <Panel className="mb-4 divide-y divide-line">
          {players.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-28 flex-1">
                {p.label}
                {p.userId && <span className="text-xs text-slate"> (member)</span>}
                <span className="tabular block text-xs text-slate">{plays.get(p.id) ?? 0} {plays.get(p.id) === 1 ? "play" : "plays"}</span>
              </span>
              <PlayerDiscordLink
                playerId={p.id}
                discordId={p.discordId}
                isMember={Boolean(p.userId)}
                members={discordMembers}
              />
            </div>
          ))}
        </Panel>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">Same person, two names?</h3>
            <p className="mt-1 mb-2 text-sm text-slate">
              Old posts might list you as &ldquo;Alex&rdquo; while you signed in as &ldquo;alexb&rdquo;. Merge the old name into you and its plays become yours.
            </p>
            <MergePlayersForm players={players.map((p) => ({ id: p.id, name: p.label, isMember: Boolean(p.userId) }))} myPlayerId={me.playerId} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Two people, one name?</h3>
            <p className="mt-1 mb-2 text-sm text-slate">
              A post that just says &ldquo;Casey&rdquo; goes to the Casey who&apos;s played before, even when it was someone new. Tick the nights that were
              someone else and they get their own name and history.
            </p>
            <SplitPlayerForm players={players.filter((p) => (plays.get(p.id) ?? 0) > 1).map((p) => ({ id: p.id, name: p.name, label: p.label }))} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Fix a name</h3>
            <p className="mt-1 mb-2 text-sm text-slate">
              For guests and people who haven&apos;t signed in. Old posts that use the previous name still match. Two people with the same name? A last
              initial tells them apart.
            </p>
            <RenamePlayerForm players={players.filter((p) => !p.userId).map((p) => ({ id: p.id, name: p.name, label: p.label }))} myPlayerId={me.playerId} />
          </div>
        </div>
      </Section>

      <SignOutButton />
    </div>
  );
}
