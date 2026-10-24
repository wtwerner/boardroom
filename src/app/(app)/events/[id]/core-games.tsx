"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Check, Lock, ThumbsUp, X } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor } from "@/db/enums";
import type { PlannedGame } from "@/lib/events";
import { choosePlan, dropPlan, setPlanVote } from "@/app/actions";
import { GameCover, Meeple, buttonClass, playerRange, playtime } from "@/components/ui";
import { PrepCard } from "../plan-card";

type Member = { id: string; name: string; color: MeepleColor | null };

/**
 * A core night's game: proposals that everyone going backs or doesn't, then the one
 * locked in, with its prep. Anyone can propose, vote, lock in or unlock.
 */
export function CoreGames({ games, going, meId }: { games: PlannedGame[]; going: Member[]; meId: string }) {
  const chosen = games.find((g) => g.chosen);
  const proposals = games.filter((g) => !g.chosen).sort((a, b) => b.votes.length - a.votes.length || a.id - b.id);

  return (
    <div className="space-y-4">
      {chosen && <PrepCard plan={chosen} members={going} meId={meId} />}
      {proposals.length > 0 ? (
        <div>
          {chosen && <h3 className="mb-2 text-sm font-semibold">Also proposed</h3>}
          <ol className="space-y-2">
            {proposals.map((g) => (
              <Proposal key={g.id} plan={g} going={going} meId={meId} />
            ))}
          </ol>
        </div>
      ) : (
        !chosen && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
            Nothing proposed yet. Propose games from the recommendations below, vote for any you&apos;d play, then lock one in so everyone can prep.
          </p>
        )
      )}
    </div>
  );
}

function Proposal({ plan, going, meId }: { plan: PlannedGame; going: Member[]; meId: string }) {
  const [votes, setVotes] = useOptimistic(plan.votes, (_v, next: string[]) => next);
  const [pending, start] = useTransition();
  const mine = votes.includes(meId);
  const g = plan.game;
  const byId = new Map(going.map((m) => [m.id, m]));
  const notGoing = votes.filter((id) => !byId.has(id)).length;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
      <Link href={`/games/${g.id}`} className="flex min-w-0 basis-full items-center gap-3 hover:underline sm:basis-0 sm:flex-1">
        <GameCover src={g.thumbnail} name={g.name} size="sm" />
        <span className="min-w-0">
          <span className="block font-semibold">{g.name}</span>
          <span className="block text-xs text-slate">
            {[playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.weight ? `weight ${g.weight.toFixed(1)}` : null].filter(Boolean).join(", ")}
          </span>
        </span>
      </Link>
      <span className="flex flex-1 items-center gap-1 sm:flex-none" aria-label={`${votes.length} ${votes.length === 1 ? "vote" : "votes"}`}>
        {going.map((m) => (
          <span key={m.id} title={`${m.name}: ${votes.includes(m.id) ? "would play it" : "hasn't voted for it"}`}>
            <Meeple color={votes.includes(m.id) ? m.color : null} className={clsx("size-4", !votes.includes(m.id) && "opacity-30")} />
          </span>
        ))}
        {notGoing > 0 && <span className="text-xs text-slate">+{notGoing}</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          aria-pressed={mine}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setVotes(mine ? votes.filter((id) => id !== meId) : [...votes, meId]);
              await setPlanVote(plan.id, !mine);
            })
          }
          className={buttonClass(mine ? "primary" : "secondary", "px-2.5 py-1.5 text-xs")}
        >
          {mine ? <Check className="size-3.5" strokeWidth={3} /> : <ThumbsUp className="size-3.5" />}
          I&apos;d play it
        </button>
        <button type="button" disabled={pending} onClick={() => start(() => choosePlan(plan.id, true))} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
          <Lock className="size-3.5" /> Lock it in
        </button>
        <button
          type="button"
          aria-label={`Withdraw ${g.name}`}
          disabled={pending}
          onClick={() => {
            if (confirm(`Take ${g.name} off the proposals?`)) start(() => dropPlan(plan.id));
          }}
          className="rounded p-1 text-slate hover:text-meeple-red"
        >
          <X className="size-4" />
        </button>
      </span>
    </li>
  );
}
