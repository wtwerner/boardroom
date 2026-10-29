import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { MeepleColor } from "@/db/enums";
import type { NightDetail } from "@/lib/events";
import { Empty, GameCover, Panel, PlayerChip, Section, TextLink } from "@/components/ui";

type Member = { id: string; name: string; color: MeepleColor | null };

/**
 * A night that's happened: who came, what was played, and how that compares with the plan.
 * `logForm` logs its plays, open until something's logged (the morning-after DM links here).
 */
export function PastNight({ n, members, logForm }: { n: NightDetail; members: Member[]; logForm: ReactNode }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const came = cameTo(n);
  const cameIds = new Set(came.map((s) => s.playerId));
  const noShows = n.going.filter((a) => !cameIds.has(a.playerId));
  const playedIds = new Set(n.plays.flatMap((p) => (p.gameId ? [p.gameId] : [])));

  return (
    <>
      <Panel className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-semibold">Came ({came.length})</span>
          {came.length ? came.map((s) => <PlayerChip key={s.playerId} name={s.name} color={s.color} />) : <span className="text-slate">Nobody logged yet</span>}
        </div>
        {n.plays.length > 0 && noShows.length > 0 && (
          <p className="text-slate">Said they were going but not in the logs: {noShows.map((a) => a.name).join(", ")}</p>
        )}
      </Panel>

      <PlayedSection n={n} logForm={logForm} />

      {n.games.length > 0 && (
        <Section title={n.night === "core" ? "The plan" : "What was brought"}>
          <p className="mb-3 text-sm text-slate">{planSummary(n, playedIds)}</p>
          <ul className="space-y-2">
            {[...n.games]
              .sort((a, b) => Number(b.chosen) - Number(a.chosen) || b.votes.length - a.votes.length)
              .map((g) => {
                const played = playedIds.has(g.game.id);
                const detail =
                  n.night === "core"
                    ? g.chosen
                      ? "Locked in"
                      : `Proposed · ${g.votes.length} ${g.votes.length === 1 ? "vote" : "votes"}`
                    : `${byId.get(g.bringerId ?? "")?.name ?? "Someone"} brought it`;
                return (
                  <li key={g.id} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                    <GameCover src={g.game.thumbnail} name={g.game.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/games/${g.game.id}`} className="block font-semibold hover:underline">
                        {g.game.name}
                      </Link>
                      <span className="block text-xs text-slate">{detail}</span>
                    </span>
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", played ? "bg-meeple-green/15 text-ink" : "bg-line/60 text-slate")}>
                      {played ? "✓ Played" : "Not played"}
                    </span>
                  </li>
                );
              })}
          </ul>
        </Section>
      )}
    </>
  );
}

/**
 * What's been logged for a night, with `logForm` to log it: on its page once it's over, and
 * below who's coming once it starts.
 */
export function PlayedSection({ n, logForm }: { n: NightDetail; logForm: ReactNode }) {
  const came = cameTo(n);
  return (
    <Section title="What was played">
      {n.plays.length ? (
        <ul className="space-y-2">
          {n.plays.map((p) => {
            const sameTable = p.players.length === came.length;
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                <GameCover src={p.thumbnail} name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  {p.gameId ? (
                    <Link href={`/games/${p.gameId}`} className="font-semibold hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{p.name}</span>
                  )}
                  {!sameTable && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.players.map((s) => (
                        <PlayerChip key={s.playerId} name={s.name} color={s.color} />
                      ))}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : logForm ? (
        <Panel id="log" className="scroll-mt-6 space-y-3 p-4">
          <p className="text-sm text-slate">Nothing logged for this event yet. Log what you played and it shows up here.</p>
          {logForm}
        </Panel>
      ) : (
        <Empty>
          Nothing logged for this event. <TextLink href="/plays">Log it on Plays</TextLink> and it shows up here.
        </Empty>
      )}
      {n.plays.length > 0 && logForm && (
        <details id="log" className="group mt-3 scroll-mt-6 rounded-xl border border-line bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
            <span className="group-open:hidden">+ Log another game from this night</span>
            <span className="hidden group-open:inline">Log another game from this night</span>
          </summary>
          <div className="border-t border-line p-4">{logForm}</div>
        </details>
      )}
    </Section>
  );
}

/** Everyone in the night's plays, once each */
function cameTo(n: NightDetail) {
  return [...new Map(n.plays.flatMap((p) => p.players).map((s) => [s.playerId, s])).values()];
}

function planSummary(n: NightDetail, playedIds: Set<number>) {
  if (n.night === "core") {
    const chosen = n.games.find((g) => g.chosen);
    if (!chosen) return "Nothing was locked in.";
    return playedIds.has(chosen.game.id) ? `${chosen.game.name} was locked in, and played.` : `${chosen.game.name} was locked in, but isn't in the logs.`;
  }
  const played = n.games.filter((g) => playedIds.has(g.game.id)).length;
  return `${played} of the ${n.games.length} ${n.games.length === 1 ? "game" : "games"} brought ${played === 1 ? "was" : "were"} played.`;
}
