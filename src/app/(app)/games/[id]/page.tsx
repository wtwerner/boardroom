import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NightTag } from "@/components/night-row";
import { Empty, GameCover, Meeple, Panel, PlayerChip, Section, Skeleton, formatDate, playerRange, playtime } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getBgaGame, getGame, getMembers, getMustPlayLeft } from "@/lib/queries";
import { bgaFacts, bgaGameUrl } from "@/lib/bga";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { HEAVY_WEIGHT, TIER_LABEL, gameTier } from "@/lib/tier";
import { OnlineToggle } from "../../online/online-controls";
import { OpinionControls } from "./opinion-controls";
import { TierControl } from "./tier-control";

export const metadata: Metadata = { title: "Game" };

export default function GamePage(props: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Game params={props.params} />
    </Suspense>
  );
}

async function Game({ params }: { params: PageProps<"/games/[id]">["params"] }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const [data, members, mustPlayLeft, bga] = await Promise.all([getGame(id), getMembers(), getMustPlayLeft(me.id, id), getBgaGame(id)]);
  if (!data) notFound();
  const { game: g, owners, opinions, plays } = data;
  const mine = opinions.find((o) => o.userId === me.id);
  const memberById = new Map(members.map((m) => [m.id, m]));

  // How many times each player has played it
  const record = new Map<number, { name: string; color: (typeof plays)[number]["players"][number]["color"]; plays: number }>();
  for (const p of plays)
    for (const s of p.players) {
      const r = record.get(s.playerId) ?? { name: s.name, color: s.color, plays: 0 };
      r.plays++;
      record.set(s.playerId, r);
    }

  const facts = [
    g.year && String(g.year),
    playerRange(g.minPlayers, g.maxPlayers),
    g.bestPlayers?.length ? `best at ${g.bestPlayers.join(", ")}` : null,
    playtime(g.minPlaytime, g.maxPlaytime),
    g.weight ? `weight ${g.weight.toFixed(1)} / 5` : null,
    g.bggRating ? `BGG ${g.bggRating.toFixed(1)}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 sm:flex-row">
        <GameCover src={g.thumbnail} image={g.image} name={g.name} size="xl" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{g.name}</h1>
          <p className="mt-2 text-sm text-slate">{facts.join(", ")}</p>
          <p className="mt-1 text-sm">
            <a className="text-accent underline-offset-4 hover:underline" href={`https://boardgamegeek.com/boardgame/${g.id}`} target="_blank" rel="noreferrer">
              View on BoardGameGeek
            </a>
            {bga && (
              <>
                <span className="text-slate"> · </span>
                <a className="text-accent underline-offset-4 hover:underline" href={bgaGameUrl(bga.slug)} target="_blank" rel="noreferrer">
                  Play on Board Game Arena
                </a>
              </>
            )}
          </p>
          {bga && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate">
              <OnlineToggle gameId={g.id} on={mine?.playOnline ?? false} label="Up for it on BGA" />
              <span>
                On BGA: {[...bgaFacts(bga), bga.premium && "Premium"].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          <div className="mt-2">
            <TierControl
              gameId={g.id}
              weight={g.weight}
              override={g.tier}
              byWeight={gameTier({ weight: g.weight, tier: null })}
              cutoff={HEAVY_WEIGHT}
              labels={TIER_LABEL}
            />
          </div>
          <div className="mt-5">
            <OpinionControls
              gameId={g.id}
              sentiment={mine?.sentiment ?? null}
              wantToPlay={mine?.wantToPlay ?? false}
              mustPlay={mine?.mustPlay ?? false}
              mustPlayLeft={mustPlayLeft}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-3">
        <Section title="What everyone thinks">
          <Panel className="divide-y divide-line">
            {members.map((m) => {
              const o = opinions.find((x) => x.userId === m.id);
              const owned = owners.find((x) => x.userId === m.id && x.own);
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
                  <Meeple color={m.color} />
                  <span className="flex-1 font-medium">{m.name}</span>
                  <span className="text-slate">
                    {[
                      o?.sentiment && `${SENTIMENT_LABEL[o.sentiment].emoji} ${SENTIMENT_LABEL[o.sentiment].label}`,
                      o?.mustPlay && "🔥 must play",
                      o?.wantToPlay && "wants to play",
                      o?.playOnline && "up for it on BGA",
                      owned && "owns it",
                    ]
                      .filter(Boolean)
                      .join(", ") || "no opinion yet"}
                  </span>
                </div>
              );
            })}
          </Panel>
        </Section>

        <Section title="Who's played it">
          {record.size ? (
            <Panel className="divide-y divide-line">
              {[...record.values()]
                .sort((a, b) => b.plays - a.plays)
                .map((r) => (
                  <div key={r.name} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
                    <Meeple color={r.color} />
                    <span className="flex-1 font-medium">{r.name}</span>
                    <span className="tabular text-slate">
                      {r.plays === 1 ? "once" : `${r.plays} times`}
                    </span>
                  </div>
                ))}
            </Panel>
          ) : (
            <Empty>Not played together yet.</Empty>
          )}
        </Section>

        <Section title={`Plays (${plays.length})`}>
          {plays.length ? (
            <ul className="space-y-3">
              {plays.map((p) => (
                <li key={p.id}>
                  <div className="text-sm font-medium">
                    {formatDate(p.playedOn)}
                    <NightTag night={p.night} className="ml-2" />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.players.map((s) => (
                      <PlayerChip key={s.playerId} name={s.name} color={s.color} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No plays logged.</Empty>
          )}
        </Section>
      </div>

      {g.description && (
        <Section title="About">
          <p className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line text-slate">{g.description}</p>
        </Section>
      )}

      {owners.some((o) => o.wishlist) && (
        <p className="text-sm text-slate">
          On the wishlist of {owners.filter((o) => o.wishlist).map((o) => memberById.get(o.userId)?.name).join(", ")}.
        </p>
      )}
      <Link href="/shelf" className="text-sm text-accent">Back to the shelf</Link>
    </div>
  );
}
