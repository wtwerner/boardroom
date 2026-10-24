"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MeepleColor } from "@/db/enums";
import type { PlannedGame } from "@/lib/events";
import { answerBringAsk, dropPlan } from "@/app/actions";
import { BringButton, Copies, type Owner } from "../game-picker";
import { GameCover, Meeple, buttonClass, playerRange, playtime } from "@/components/ui";

type Member = { id: string; name: string; color: MeepleColor | null };

/**
 * A casual night's bring list, by who's bringing what, and who's been asked to bring something
 * and not answered yet. A game comes with someone who owns it.
 */
export function CasualGames(props: {
  nightId: number;
  games: PlannedGame[];
  members: Member[];
  meId: string;
  headcount: number;
  /** Who owns each game on the list, for one nobody's bringing yet */
  owners: Record<number, Owner[]>;
}) {
  const { nightId, games, members, meId, headcount } = props;
  if (games.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
        Nothing on the bring list yet. Pick from the recommendations below and say you&apos;ll bring it, so nobody brings the same box twice.
      </p>
    );
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const groups = new Map<string, PlannedGame[]>();
  for (const g of [...games].sort((a, b) => order(a, meId) - order(b, meId))) {
    const key = g.bringerId ? `bringing:${g.bringerId}` : g.askedId ? `asked:${g.askedId}` : "nobody";
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  const fits = games.filter((g) => (g.game.minPlayers ?? 0) <= headcount && (g.game.maxPlayers ?? 99) >= headcount).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">
        {games.length === 1
          ? `1 game coming, ${fits ? "and it fits" : "but it doesn't fit"}`
          : `${games.length} games coming, ${fits === games.length ? "all" : fits} of them for`}{" "}
        {headcount} {headcount === 1 ? "player" : "players"} at one table.
      </p>
      {[...groups].map(([key, list]) => {
        const { bringerId, askedId } = list[0];
        const who = byId.get(bringerId ?? askedId ?? "");
        return (
          <div key={key}>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              {who ? (
                <>
                  <Meeple color={who.color} />{" "}
                  {bringerId
                    ? who.id === meId
                      ? "You're bringing"
                      : `${who.name} is bringing`
                    : who.id === meId
                      ? "You've been asked to bring"
                      : `Asked ${who.name}, not answered yet`}
                </>
              ) : (
                "Nobody's bringing these yet"
              )}
            </h3>
            <ul className="space-y-2">
              {list.map((g) => (
                <BringRow key={g.id} nightId={nightId} plan={g} meId={meId} owners={props.owners[g.game.id] ?? []} askedBy={byId.get(g.createdBy ?? "")?.name ?? null} headcount={headcount} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Asks waiting on me first, then mine, everyone else's, asks waiting on others, and games nobody's bringing */
function order(g: PlannedGame, meId: string) {
  if (g.askedId === meId) return 0;
  if (g.bringerId === meId) return 1;
  if (g.bringerId) return 2;
  if (g.askedId) return 3;
  return 4;
}

function BringRow(props: { nightId: number; plan: PlannedGame; meId: string; owners: Owner[]; askedBy: string | null; headcount: number }) {
  const { nightId, plan, meId, owners, askedBy, headcount } = props;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const g = plan.game;
  const fits = (g.minPlayers ?? 0) <= headcount && (g.maxPlayers ?? 99) >= headcount;
  const answer = (yes: boolean) =>
    start(async () => {
      const res = await answerBringAsk(plan.id, yes);
      setError(res.ok ? null : res.error);
    });
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
      <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-0 sm:flex-1">
        <Link href={`/games/${g.id}`} tabIndex={-1} aria-hidden className="shrink-0">
          <GameCover src={g.thumbnail} name={g.name} size="sm" />
        </Link>
        <span className="min-w-0">
          <Link href={`/games/${g.id}`} className="block font-semibold hover:underline">{g.name}</Link>
          <span className="block text-xs text-slate">
            {[playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.weight ? `weight ${g.weight.toFixed(1)}` : null].filter(Boolean).join(", ")}
            {!fits && <span className="ml-1.5 rounded-full bg-meeple-red/12 px-1.5 py-0.5 text-ink">not for {headcount}</span>}
          </span>
          {/* Nobody's bringing it yet: an owner can, or be asked */}
          {!plan.bringerId && !plan.askedId && <Copies nightId={nightId} gameId={g.id} owners={owners} meId={meId} onList={false} />}
        </span>
      </div>
      {plan.askedId === meId && !plan.bringerId ? (
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {askedBy && <span className="text-xs text-slate">{askedBy} asked</span>}
          <button type="button" disabled={pending} onClick={() => answer(true)} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
            I&apos;ll bring it
          </button>
          <button type="button" disabled={pending} onClick={() => answer(false)} className={buttonClass("ghost", "px-2.5 py-1.5 text-xs")}>
            Can&apos;t this time
          </button>
        </span>
      ) : plan.bringerId || plan.askedId ? (
        // Anyone can take a game off, someone else's or an ask, so a wrong one can be undone
        <button type="button" disabled={pending} onClick={() => start(() => dropPlan(plan.id))} className={buttonClass("ghost", "ml-auto px-2.5 py-1.5 text-xs")}>
          {plan.bringerId === meId ? "Not bringing it" : "Take it off"}
        </button>
      ) : (
        <BringButton nightId={nightId} gameId={g.id} owners={owners} meId={meId} />
      )}
      {error && <span className="basis-full text-right text-xs text-meeple-red">{error}</span>}
    </li>
  );
}
