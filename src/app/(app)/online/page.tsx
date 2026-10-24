import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Empty, GameCover, Meeple, PageHeader, Panel, Skeleton, TextLink, formatDate } from "@/components/ui";
import { bgaFacts, bgaGameUrl } from "@/lib/bga";
import { type BgaListing, type OnlineGame, getBgaByBggId, getBgaMembers, getOnlineGames } from "@/lib/queries";
import { type Candidate, MIN_EVIDENCE, getRecommendations } from "@/lib/recommend";
import { requireUser } from "@/lib/session";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { describeReason } from "@/lib/taste";
import { BGA_SYNC_KEY, lastSyncedAt } from "@/lib/sync";
import type { Sentiment } from "@/db/enums";
import { CollapsibleSection, LoadBgaButton, OnlineToggle } from "./online-controls";

export const metadata: Metadata = { title: "Online" };

type Member = Awaited<ReturnType<typeof getBgaMembers>>[number];

export default function OnlinePage() {
  return (
    <>
      <PageHeader title="Online">
        <a href="https://boardgamearena.com" target="_blank" rel="noreferrer" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          Board Game Arena
        </a>
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Online />
      </Suspense>
    </>
  );
}

const SENTIMENT_SCORE: Record<Sentiment, number> = { love: 2, like: 1, meh: -1, nope: -2 };
const loved = (g: OnlineGame) => g.sentiments.reduce((n, s) => n + SENTIMENT_SCORE[s.sentiment], 0);

async function Online() {
  const me = await requireUser();
  const [games, members, syncedAt] = await Promise.all([getOnlineGames(), getBgaMembers(), lastSyncedAt(BGA_SYNC_KEY)]);
  const mine = members.find((m) => m.id === me.id);

  if (!syncedAt) {
    return (
      <Empty>
        The list of games on Board Game Arena hasn&apos;t been loaded yet. It refreshes every night.
        <LoadBgaButton />
      </Empty>
    );
  }

  const keen = games.filter((g) => g.playOnline.length > 0).sort((a, b) => b.playOnline.length - a.playOnline.length || a.name.localeCompare(b.name));
  const rest = games.filter((g) => g.playOnline.length === 0);
  const replay = rest.filter((g) => g.plays > 0).sort((a, b) => loved(b) - loved(a) || b.plays - a.plays);
  const unplayed = rest.filter((g) => g.plays === 0 && g.ownerIds.length > 0);
  const tryFirst = rest.filter((g) => g.plays === 0 && g.ownerIds.length === 0 && (g.wishlistedBy.length > 0 || g.onBuyList));
  const rowProps = { members, meId: me.id };

  return (
    <div className="space-y-10">
      <p className="max-w-[70ch] text-sm text-slate">
        Our games that are on Board Game Arena, for the ones that rarely make it to the table or deserve another go between events.
        Turn-based games play a move at a time over days. Tap <em>I&apos;m up for it</em> on any you&apos;d play there.
      </p>

      <CollapsibleSection id="names" title="Find each other on BGA">
        <Panel className="divide-y divide-line">
          {members
            .filter((m) => m.bgaUsername)
            .map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-3 py-2.5 text-sm">
                <Meeple color={m.color} />
                <span className="font-medium">{m.name}</span>
                <span className="text-slate">{m.bgaUsername}</span>
                {m.bgaPremium && <span className="rounded-full bg-meeple-yellow/25 px-1.5 py-px text-[0.65rem] font-semibold tracking-wide uppercase">Premium</span>}
              </div>
            ))}
          {members.every((m) => !m.bgaUsername) && <p className="px-3 py-2.5 text-sm text-slate">Nobody has added their BGA name yet.</p>}
        </Panel>
        <p className="mt-2 text-xs text-slate">
          {members.some((m) => !m.bgaUsername) && <>Not added yet: {members.filter((m) => !m.bgaUsername).map((m) => (m.id === me.id ? "you" : m.name)).join(", ")}. </>}
          <TextLink href="/settings#bga" className="text-xs">{mine?.bgaUsername ? "Change yours in Settings" : "Add yours in Settings"}</TextLink>
        </p>
      </CollapsibleSection>

      <CollapsibleSection id="keen" title={`Up for it online (${keen.length})`}>
        {keen.length ? <GameList games={keen} {...rowProps} /> : <Empty>Nobody&apos;s marked a game yet. Tap <em>I&apos;m up for it</em> on one below.</Empty>}
      </CollapsibleSection>

      <CollapsibleSection id="replay" title={`Played together, worth another go (${replay.length})`} action={<span className="text-xs text-slate">favorites first</span>}>
        {replay.length ? <GameList games={replay} {...rowProps} /> : <Empty>None of the games we&apos;ve played are on BGA.</Empty>}
      </CollapsibleSection>

      <CollapsibleSection id="recommended" title="Recommended on BGA">
        <p className="mb-3 text-sm text-slate">
          Games on BGA that nobody owns or has played with the group, scored against everyone&apos;s taste the way{" "}
          <TextLink href="/about#discover">Discover</TextLink> scores games.
        </p>
        <Suspense fallback={<Skeleton className="h-64" />}>
          {/* Shown elsewhere on the page: the ones people are up for and the ones on a wishlist or the buy list */}
          <Recommended members={members} meId={me.id} playerId={me.playerId} listed={[...keen, ...tryFirst].map((g) => g.id)} />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection id="unplayed" title={`On the shelf, never played (${unplayed.length})`}>
        {unplayed.length ? <GameList games={unplayed} {...rowProps} /> : <Empty>Every shelf game on BGA has been played.</Empty>}
      </CollapsibleSection>

      <CollapsibleSection id="try" title={`Try before you buy (${tryFirst.length})`}>
        <p className="mb-3 text-sm text-slate">
          On a wishlist or the <TextLink href="/discover">buy list</TextLink>, and nobody owns it yet.
        </p>
        {tryFirst.length ? <GameList games={tryFirst} {...rowProps} /> : <Empty>Nothing on the wishlists or buy list is on BGA.</Empty>}
      </CollapsibleSection>

      <p className="text-xs text-slate">
        From BGA&apos;s game list, refreshed {formatDate(syncedAt.toISOString().slice(0, 10), { month: "short", day: "numeric" })}. Plays on BGA aren&apos;t
        logged here.
      </p>
    </div>
  );
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

async function Recommended({ members, meId, playerId, listed }: { members: Member[]; meId: string; playerId: number | null; listed: number[] }) {
  const [rec, bga] = await Promise.all([getRecommendations(meId, playerId, { online: true }), getBgaByBggId()]);
  if (rec.scoredMemberIds.length === 0) {
    return <Empty>Picks start once someone has rated or ranked {MIN_EVIDENCE} games.</Empty>;
  }
  const shown = new Set(listed);
  const picks = rec.group.online.filter((c) => !shown.has(c.game.id) && bga.has(c.game.id));
  if (picks.length === 0) return <Empty>BGA&apos;s popular games are still being looked up on BGG, a batch each night. Check back tomorrow.</Empty>;
  return (
    <Panel className="divide-y divide-line">
      {picks.map((c) => (
        <PickRow key={c.game.id} c={c} bga={bga.get(c.game.id)!} members={members} meId={meId} scoredIds={rec.scoredMemberIds} />
      ))}
    </Panel>
  );
}

function PickRow({ c, bga, members, meId, scoredIds }: { c: Candidate; bga: BgaListing; members: Member[]; meId: string; scoredIds: string[] }) {
  const g = c.game;
  const name = (id: string) => (id === meId ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
  const hosts = members.filter((m) => m.bgaPremium);
  // Why: what the keenest member likes about it, as on Discover
  const keenest = scoredIds.map((id) => ({ id, fit: c.fits[id] })).sort((a, b) => b.fit.chance - a.fit.chance)[0];
  const reasons = keenest.fit.reasons
    .filter((r) => r.tone === "good")
    .slice(0, 2)
    .map((r) => describeReason(r, keenest.id === meId ? null : name(keenest.id)));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <Link href={`/games/${g.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-2.5">
        <GameCover src={g.thumbnail} name={g.name} size="md" />
        <span className="min-w-0 text-sm">
          <span className="block font-semibold hover:underline">{g.name}</span>
          <span className="block text-xs text-slate">
            {[...bgaFacts(bga), g.weight ? `weight ${g.weight.toFixed(1)}` : null, bga.premium && `Premium (${hosts.length ? `${hosts.map((h) => name(h.id)).join(", ")} can host` : "needs a Premium host"})`]
              .filter(Boolean)
              .join(", ")}
          </span>
          {reasons.length > 0 && <span className="block text-xs text-accent">{reasons.join(", ")}</span>}
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-right" title="The average of everyone's chances">
          <span className="font-display tabular block text-xl leading-none">{percent(c.group.chance)}</span>
          <span className="block text-[0.7rem] text-slate">{c.group.of > 1 ? "average chance" : "chance of a hit"}</span>
        </span>
        {scoredIds.length > 1 && (
          <ul aria-label="Chance for each member" className="flex gap-2 text-xs">
            {members
              .filter((m) => scoredIds.includes(m.id))
              .map((m) => (
                <li key={m.id} className="inline-flex items-center gap-0.5" title={`${m.name}: ${percent(c.fits[m.id].chance)}`}>
                  <Meeple color={m.color} className="size-3.5" />
                  <span className="tabular">{percent(c.fits[m.id].chance)}</span>
                </li>
              ))}
          </ul>
        )}
        <OnlineToggle gameId={g.id} on={false} />
        <a
          href={bgaGameUrl(bga.slug)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-accent hover:border-ink/40"
        >
          Play on BGA
        </a>
      </div>
    </div>
  );
}

function GameList({ games, members, meId }: { games: OnlineGame[]; members: Member[]; meId: string }) {
  return (
    <Panel className="divide-y divide-line">
      {games.map((g) => (
        <GameRow key={g.id} g={g} members={members} meId={meId} />
      ))}
    </Panel>
  );
}

function GameRow({ g, members, meId }: { g: OnlineGame; members: Member[]; meId: string }) {
  const name = (id: string) => (id === meId ? "you" : (members.find((m) => m.id === id)?.name ?? "someone"));
  const names = (ids: string[]) => ids.map(name).join(", ");
  const hosts = members.filter((m) => m.bgaPremium);

  const context = [
    g.plays ? `played ${g.plays}×, last ${formatDate(g.lastPlayed!, { month: "short", day: "numeric" })}` : null,
    g.ownerIds.length ? `owned by ${names(g.ownerIds)}` : null,
    g.wishlistedBy.length ? `on ${names(g.wishlistedBy)}'s wishlist` : null,
    g.onBuyList ? "on the buy list" : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <Link href={`/games/${g.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-2.5">
        <GameCover src={g.thumbnail} name={g.name} size="md" />
        <span className="min-w-0 text-sm">
          <span className="block font-semibold hover:underline">{g.name}</span>
          <span className="block text-xs text-slate">
            {[...bgaFacts(g.bga), g.bga.premium && `Premium (${hosts.length ? `${names(hosts.map((h) => h.id))} can host` : "needs a Premium host"})`]
              .filter(Boolean)
              .join(", ")}
          </span>
          {context.length > 0 && <span className="block text-xs text-slate">{context.join(", ")}</span>}
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {g.sentiments.length > 0 && (
          <span className="text-xs" aria-label="How the group rates it">
            {g.sentiments.map((s) => (
              <span key={s.userId} title={`${name(s.userId)}: ${SENTIMENT_LABEL[s.sentiment].label}`}>{SENTIMENT_LABEL[s.sentiment].emoji}</span>
            ))}
          </span>
        )}
        {g.playOnline.length > 0 && (
          <span className="flex items-center" aria-label={`Up for it: ${names(g.playOnline)}`} title={`Up for it: ${names(g.playOnline)}`}>
            {g.playOnline.map((id) => (
              <Meeple key={id} color={members.find((m) => m.id === id)?.color ?? null} className="-ml-1 size-4 first:ml-0" />
            ))}
          </span>
        )}
        <OnlineToggle gameId={g.id} on={g.playOnline.includes(meId)} />
        <a
          href={bgaGameUrl(g.bga.slug)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-accent hover:border-ink/40"
        >
          Play on BGA
        </a>
      </div>
    </div>
  );
}
