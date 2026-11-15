"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { acceptBggSuggestions, undoBggSuggestions } from "@/app/actions";
import { Empty, GameCover, Panel, buttonClass } from "@/components/ui";
import { SENTIMENTS, type Sentiment } from "@/db/enums";
import { formatBggRating } from "@/lib/bgg-ratings";
import { SENTIMENT_LABEL } from "@/lib/sentiment";

export type ReviewRow = { id: number; name: string; thumbnail: string | null; bggRating: number; suggested: Sentiment; where: string };
type Choice = Sentiment | "skip";
type Picks = { gameId: number; sentiment: Sentiment }[];

const games = (n: number) => (n === 1 ? "1 game" : `${n} games`);

/**
 * The suggestions grouped by the face they suggest, best BGG rating first. Each starts as its
 * suggestion; change it or skip it, then save the lot. Undo takes back exactly what was saved.
 */
export function BggReview({ rows, hasBgg }: { rows: ReviewRow[]; hasBgg: boolean }) {
  // Only what's been changed; everything else is its suggestion
  const [changed, setChanged] = useState<Map<number, Choice>>(() => new Map());
  const [saved, setSaved] = useState<Picks | null>(null);
  const [undone, setUndone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choiceOf = (r: ReviewRow): Choice => changed.get(r.id) ?? r.suggested;
  const choose = (ids: number[], c: Choice | null) =>
    setChanged((m) => {
      const next = new Map(m);
      for (const id of ids) {
        if (c === null) next.delete(id);
        else next.set(id, c);
      }
      return next;
    });

  if (saved) {
    return (
      <Panel className="space-y-4 p-4" role="status">
        <p className="text-sm">
          <strong className="font-semibold">Rated {games(saved.length)}</strong>{" "}
          ({SENTIMENTS.flatMap((s) => {
            const n = saved.filter((p) => p.sentiment === s).length;
            return n ? [`${n} ${SENTIMENT_LABEL[s].emoji}`] : [];
          }).join(", ")}). You can change any of them on Rate games or the game&apos;s page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/rankings" className={buttonClass("primary")}>
            Rank them next
          </Link>
          <Link href="/rankings/rate" className={buttonClass("secondary")}>
            Back to Rate games
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await undoBggSuggestions(saved);
                if (!res.ok) return setError(res.error);
                setUndone(saved.length);
                setSaved(null);
              })
            }
            className={buttonClass("ghost")}
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-slate">
            {games(rows.length)} you skipped {rows.length === 1 ? "is" : "are"} still waiting.{" "}
            <button type="button" onClick={() => (setChanged(new Map()), setSaved(null))} className="text-accent underline-offset-4 hover:underline">
              Review {rows.length === 1 ? "it" : "them"}
            </button>
          </p>
        )}
        {error && <p className="text-sm text-meeple-red">{error}</p>}
      </Panel>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty>
        {hasBgg ? (
          <>Nothing to review: every game here you&apos;ve rated on BGG has a face already. </>
        ) : (
          <>
            No BGG ratings yet. <Link href="/settings#bgg" className="text-accent underline-offset-4 hover:underline">Add your BGG collection</Link>{" "}
            and the games you&apos;ve rated there show up here.{" "}
          </>
        )}
        <Link href="/rankings/rate" className="text-accent underline-offset-4 hover:underline">
          Back to Rate games
        </Link>
      </Empty>
    );
  }

  const picks: Picks = rows.flatMap((r) => {
    const c = choiceOf(r);
    return c === "skip" ? [] : [{ gameId: r.id, sentiment: c }];
  });
  const skipped = rows.length - picks.length;
  const summary = SENTIMENTS.flatMap((s) => {
    const n = picks.filter((p) => p.sentiment === s).length;
    return n ? [`${n} ${SENTIMENT_LABEL[s].emoji}`] : [];
  }).join(", ");

  return (
    <div className="space-y-8">
      {undone > 0 && (
        <p role="status" className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
          Undone: {undone === 1 ? "that game is" : `those ${undone} games are`} unrated again.
        </p>
      )}

      {SENTIMENTS.map((s) => {
        const group = rows.filter((r) => r.suggested === s).sort((a, b) => b.bggRating - a.bggRating || a.name.localeCompare(b.name));
        if (!group.length) return null;
        const ids = group.map((r) => r.id);
        const allSkipped = group.every((r) => choiceOf(r) === "skip");
        return (
          <section key={s} aria-labelledby={`suggested-${s}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={`suggested-${s}`} className="font-wide text-base">
                <span aria-hidden>{SENTIMENT_LABEL[s].emoji}</span> Suggested: {SENTIMENT_LABEL[s].label}{" "}
                <span className="tabular text-sm font-normal text-slate">{group.length}</span>
              </h3>
              <button type="button" onClick={() => choose(ids, allSkipped ? null : "skip")} className="text-xs text-accent underline-offset-4 hover:underline">
                {allSkipped ? "Include these" : "Skip these"}
              </button>
            </div>
            <Panel className="divide-y divide-line">
              {group.map((r) => (
                <Row key={r.id} row={r} choice={choiceOf(r)} onChoose={(c) => choose([r.id], c === r.suggested ? null : c)} />
              ))}
            </Panel>
          </section>
        );
      })}

      <div className="sticky bottom-24 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-token md:bottom-4">
        <button
          type="button"
          disabled={pending || picks.length === 0}
          onClick={() =>
            start(async () => {
              const res = await acceptBggSuggestions(picks);
              if (!res.ok) return setError(res.error);
              setError(null);
              setUndone(0);
              setSaved(res.rated ?? []);
            })
          }
          className={buttonClass("primary")}
        >
          {pending ? "Rating…" : picks.length ? `Rate ${games(picks.length)}` : "Nothing to rate"}
        </button>
        <p className="text-sm text-slate" aria-live="polite">
          {summary}
          {skipped > 0 && `${summary ? " · " : ""}${skipped} skipped`}
        </p>
        {error && <p className="w-full text-sm text-meeple-red">{error}</p>}
      </div>
    </div>
  );
}

function Row({ row: r, choice, onChoose }: { row: ReviewRow; choice: Choice; onChoose: (c: Choice) => void }) {
  const skipped = choice === "skip";
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className={clsx("flex min-w-0 flex-1 items-center gap-3", skipped && "opacity-50")}>
        <GameCover src={r.thumbnail} name={r.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{r.name}</span>
          <span className="block truncate text-xs text-slate">
            <span className="tabular font-semibold text-ink">{formatBggRating(r.bggRating)}</span> on BGG · {r.where}
            {!skipped && choice !== r.suggested && ` · suggested ${SENTIMENT_LABEL[r.suggested].emoji}`}
          </span>
        </span>
      </div>
      <div role="group" aria-label={`Your rating for ${r.name}`} className="flex items-center gap-1">
        {SENTIMENTS.map((s) => (
          <button
            key={s}
            type="button"
            title={SENTIMENT_LABEL[s].label}
            aria-label={SENTIMENT_LABEL[s].label}
            aria-pressed={choice === s}
            onClick={() => onChoose(s)}
            className={clsx(
              "grid size-9 place-items-center rounded-full border text-lg transition-transform active:translate-y-0.5",
              choice === s ? "border-ink/80 bg-felt shadow-token" : "border-line bg-card grayscale-[60%] hover:grayscale-0",
            )}
          >
            {SENTIMENT_LABEL[s].emoji}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={skipped}
          onClick={() => onChoose(skipped ? r.suggested : "skip")}
          className={clsx(
            "ml-1 h-9 rounded-full border px-3 text-xs",
            skipped ? "border-ink/80 bg-felt text-felt-ink" : "border-line bg-card text-slate hover:border-ink/40",
          )}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
