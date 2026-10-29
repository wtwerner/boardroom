"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ExternalLink, Unlock, X } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor } from "@/db/enums";
import { addPrepLink, choosePlan, removePrepLink, setPrepped } from "@/app/actions";
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
  const bgg = `https://boardgamegeek.com/boardgame/${g.id}`;
  // Every game gets BGG's rules files and teach videos; people add anything better they find
  const links = [
    { label: "Rules and player aids on BGG", url: `${bgg}/files`, builtIn: true },
    { label: "How-to-play videos on BGG", url: `${bgg}/videos/instructional`, builtIn: true },
    ...plan.links.map((l) => ({ ...l, builtIn: false })),
  ];

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
        <h3 className="text-sm font-semibold">Prep</h3>
        <ul className="mt-1.5 space-y-1">
          {links.map((l) => (
            <li key={l.url} className="flex items-center gap-2 text-sm">
              <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-accent underline-offset-4 hover:underline">
                <ExternalLink className="size-3.5 shrink-0" />
                <span className="truncate">{l.label}</span>
              </a>
              {!l.builtIn && !lockLinks && (
                <button
                  type="button"
                  aria-label={`Remove ${l.label}`}
                  onClick={() => start(() => removePrepLink(plan.id, l.url))}
                  className="rounded p-0.5 text-slate hover:text-meeple-red"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!lockLinks && <AddLinkForm planId={plan.id} />}
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

function AddLinkForm({ planId }: { planId: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-slate hover:text-ink">
        + Add a link (a teach video, rules PDF, player aid)
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const res = await addPrepLink(planId, String(form.get("url")), String(form.get("label")));
          if (res.ok) {
            setOpen(false);
            setError(null);
          } else setError(res.error);
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        <input name="url" type="url" required placeholder="https://…" aria-label="Link" autoFocus className="min-w-0 flex-1 rounded-md border border-line bg-table px-2 py-1 text-sm" />
        <input name="label" placeholder="What is it? (optional)" aria-label="Label" className="min-w-0 flex-1 rounded-md border border-line bg-table px-2 py-1 text-sm" />
        <button className={buttonClass("secondary", "px-2.5 py-1 text-xs")} disabled={pending}>
          Add
        </button>
      </div>
      {error && <p className="text-xs text-meeple-red">{error}</p>}
    </form>
  );
}
