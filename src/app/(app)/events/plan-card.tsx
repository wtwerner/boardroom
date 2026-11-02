"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Unlock } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor } from "@/db/enums";
import { choosePlan, setPrepped } from "@/app/actions";
import { PrepLinks } from "@/components/prep-links";
import { GameCover, Meeple, buttonClass, playerRange, playtime } from "@/components/ui";
import type { PlannedGame } from "@/lib/events";

type Member = { id: string; name: string; color: MeepleColor | null };

/**
 * A core night's locked-in game: what to read or watch beforehand, and who's done their prep.
 * lockLinks (a demo) shows the links without adding or removing any.
 */
export function PrepCard({ plan, members, meId, lockLinks }: { plan: PlannedGame; members: Member[]; meId: string; lockLinks: boolean }) {
  const g = plan.game;
  const [ready, setReady] = useOptimistic(plan.readyUserIds, (_ids, next: string[]) => next);
  const [pending, start] = useTransition();
  const iAmReady = ready.includes(meId);
  return (
    <article className="rounded-xl border border-ink/70 bg-card shadow-token">
      <div className="flex gap-4 p-4">
        <GameCover src={g.thumbnail} name={g.name} size="md" />
        <div className="min-w-0 flex-1">
          <Link href={`/games/${g.id}`} className="font-display text-xl leading-tight hover:underline">
            {g.name}
          </Link>
          <p className="mt-0.5 text-xs text-slate">
            {[playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.weight ? `weight ${g.weight.toFixed(1)}` : null]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent">✓ Locked in</p>
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <h3 className="mb-1.5 text-sm font-semibold">Prep</h3>
        <PrepLinks game={g} links={plan.links} lockLinks={lockLinks} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button
          type="button"
          aria-pressed={iAmReady}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setReady(iAmReady ? ready.filter((id) => id !== meId) : [...ready, meId]);
              await setPrepped(plan.id, !iAmReady);
            })
          }
          className={buttonClass(iAmReady ? "primary" : "secondary")}
        >
          {iAmReady ? "I've done my prep" : "Mark my prep done"}
        </button>
        <ul aria-label="Prep done" className="flex flex-wrap gap-1">
          {members.map((m) => {
            const done = ready.includes(m.id);
            return (
              <li
                key={m.id}
                title={`${m.name}: ${done ? "prepped" : "not yet"}`}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-1 text-xs",
                  done ? "border-ink/50 bg-felt-soft font-medium" : "border-dashed border-line text-slate",
                )}
              >
                <Meeple color={done ? m.color : null} className="size-3.5" />
                {m.name}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => start(() => choosePlan(plan.id, false))}
          className={buttonClass("ghost", "ml-auto px-2 py-1 text-xs")}
        >
          <Unlock className="size-3.5" /> Unlock
        </button>
      </div>
    </article>
  );
}
