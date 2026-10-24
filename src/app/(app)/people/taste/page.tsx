import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { MeepleColor } from "@/db/enums";
import { Empty, GameCover, Meeple, PageHeader, Panel, Section, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { MIN_EVIDENCE, type TasteInsights, getTasteInsights } from "@/lib/recommend";
import { Chips, alike, whoLikes } from "@/components/taste";
import { PeopleTabs } from "../tabs";

export const metadata: Metadata = { title: "Group taste" };

type Member = { id: string; name: string; color: MeepleColor | null };

export default function GroupTastePage() {
  return (
    <>
      <PageHeader title="People">
        <PeopleTabs current="taste" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <GroupTaste />
      </Suspense>
    </>
  );
}

async function GroupTaste() {
  await requireUser();
  const { members, insights } = await getTasteInsights();
  return <Taste insights={insights} members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))} />;
}

function Taste({ insights: i, members }: { insights: TasteInsights; members: Member[] }) {
  const m = (id: string) => members.find((x) => x.id === id);
  const counted = members.filter((x) => (i.evidence[x.id] ?? 0) >= MIN_EVIDENCE);
  if (counted.length < 2) {
    return (
      <Empty>
        Group taste needs at least two people with {MIN_EVIDENCE}+ games rated or ranked. <TextLink href="/rankings/rate">Rate games</TextLink>
      </Empty>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-3">
        <Section title="Everyone likes">
          <Chips items={i.sharedLikes.map((f) => f.label)} tone="good" empty="Nothing everyone agrees on yet." />
        </Section>
        <Section title="Nobody likes">
          <Chips items={i.sharedDislikes.map((f) => f.label)} tone="bad" empty="No shared dislikes yet." />
        </Section>
        <Section title="Splits the group">
          {i.divisive.length ? (
            <ul className="space-y-2 text-sm">
              {i.divisive.map((f) => (
                <li key={f.key}>
                  <span className="font-medium">{f.label}</span>
                  <span className="block text-xs text-slate">
                    {whoLikes(f, (id) => m(id)?.name)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing divisive yet.</Empty>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Preferred weight">
          <p className="mb-3 text-sm text-slate">The weight range of the games each person likes (1 light, 5 heavy). Games in the overlap suit everyone.</p>
          <Panel className="space-y-2 p-4">
            {i.weights.map((w) => {
              const pct = (x: number) => `${((Math.min(5, Math.max(1, x)) - 1) / 4) * 100}%`;
              const color = m(w.userId)?.color;
              const fill = color ? `var(--meeple-${color})` : "var(--slate)";
              return (
                <div key={w.userId} className="flex items-center gap-3 text-sm">
                  <span className="w-20 truncate">{m(w.userId)?.name}</span>
                  <div className="relative h-3 flex-1 rounded-full bg-line/60">
                    <div
                      className="absolute top-0 h-3 rounded-full opacity-40"
                      style={{ left: pct(w.mean - w.sd), width: `calc(${pct(w.mean + w.sd)} - ${pct(w.mean - w.sd)})`, background: fill }}
                    />
                    <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: pct(w.mean), background: fill }} />
                  </div>
                  <span className="tabular w-8 text-right text-xs text-slate">{w.mean.toFixed(1)}</span>
                </div>
              );
            })}
            <div className="flex justify-between pl-23 pr-11 text-[0.7rem] text-slate">
              {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}
            </div>
          </Panel>
        </Section>

        <Section title="Taste twins">
          <p className="mb-3 text-sm text-slate">How similarly each pair rates the games they&apos;ve both played.</p>
          {i.pairs.length ? (
            <Panel className="divide-y divide-line">
              {i.pairs.map((p) => (
                <div key={`${p.a}${p.b}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Meeple color={m(p.a)?.color ?? null} />
                  <Meeple color={m(p.b)?.color ?? null} className="-ml-2 size-4" />
                  <span className="flex-1">
                    {m(p.a)?.name} &amp; {m(p.b)?.name}
                  </span>
                  <span className="text-slate" title={`Correlation of their ratings: ${p.r.toFixed(2)} (1 = identical, 0 = unrelated, −1 = opposite)`}>
                    {alike(p.r)}
                  </span>
                  <span className="tabular w-24 text-right text-xs text-slate">
                    {p.shared} in common
                  </span>
                </div>
              ))}
            </Panel>
          ) : (
            <Empty>Pairs need 3 games in common to compare.</Empty>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <GameList title="Games you agree on" games={i.agreedGames} members={members} empty="No clear favorites everyone shares yet." />
        <GameList title="Games that split you" games={i.splitGames} members={members} empty="Nothing splits the group yet." />
      </div>

      <p className="text-xs text-slate">
        Based on rankings, ratings and BGG ratings:{" "}
        {members.map((x) => `${x.name} ${i.evidence[x.id] ?? 0} games`).join(", ")}. People with fewer than {MIN_EVIDENCE} don&apos;t count
        toward group scores yet.
      </p>
    </div>
  );
}

function GameList({ title, games, members, empty }: { title: string; games: TasteInsights["splitGames"]; members: Member[]; empty: string }) {
  return (
    <Section title={title}>
      {games.length ? (
        <ul className="space-y-2">
          {games.map(({ game, prefs }) => (
            <li key={game.id}>
              <Link href={`/games/${game.id}`} className="-m-1 flex items-center gap-3 rounded-lg p-1 hover:bg-felt-soft">
                <GameCover src={game.thumbnail} name={game.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{game.name}</span>
                <span className="flex gap-2 text-xs">
                  {Object.entries(prefs).map(([id, v]) => {
                    const who = members.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-0.5" title={`${who?.name}: ${v > 0 ? "above" : "below"} their average`}>
                        <Meeple color={who?.color ?? null} className="size-3.5" />
                        {v > 0.15 ? "▲" : v < -0.15 ? "▼" : "–"}
                      </span>
                    );
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Section>
  );
}
