"use client";

import { useState, useTransition } from "react";
import { ExternalLink, X } from "lucide-react";
import { addPrepLink, removePrepLink } from "@/app/actions";
import type { PrepLink } from "@/db/schema";
import { bggPrepLinks } from "@/lib/bgg-links";
import { DemoTag, buttonClass } from "@/components/ui";

/**
 * A game's prep: BGG's rules files and teach videos, then the links the group added for it. The
 * links are the game's, so they're there on its page and for every night it's locked in.
 * lockLinks (a demo) shows the links without adding or removing any, and says why; readOnly (a
 * casual account) shows them and nothing else.
 */
export function PrepLinks({ game, links, lockLinks, readOnly = false }: { game: { id: number; name: string }; links: PrepLink[]; lockLinks: boolean; readOnly?: boolean }) {
  const [, start] = useTransition();
  const all = [...bggPrepLinks(game.id, game.name).map((l) => ({ ...l, builtIn: true })), ...links.map((l) => ({ ...l, builtIn: false }))];
  return (
    <>
      <ul className="space-y-1">
        {all.map((l) => (
          <li key={l.url} className="flex items-center gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-accent underline-offset-4 hover:underline">
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="truncate">{l.label}</span>
            </a>
            {!l.builtIn && !lockLinks && !readOnly && (
              <button
                type="button"
                aria-label={`Remove ${l.label}`}
                onClick={() => start(() => removePrepLink(game.id, l.url))}
                className="rounded p-0.5 text-slate hover:text-meeple-red"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : lockLinks ? (
        <p className="mt-2 text-xs text-slate">
          <DemoTag /> Adding links is off on the demo.
        </p>
      ) : (
        <AddLinkForm gameId={game.id} />
      )}
    </>
  );
}

function AddLinkForm({ gameId }: { gameId: number }) {
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
          const res = await addPrepLink(gameId, String(form.get("url")), String(form.get("label")));
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
