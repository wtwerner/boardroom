"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import { MUST_PLAY_LIMIT, SENTIMENTS, type Sentiment } from "@/db/enums";
import { setOpinion } from "@/app/actions";
import { SENTIMENT_LABEL } from "@/lib/sentiment";

type State = { sentiment: Sentiment | null; wantToPlay: boolean; mustPlay: boolean };

/**
 * `mustPlayLeft` is how many must-play votes the member has free, not counting
 * this game. `compact` is the one-line version used in the rate-games list.
 */
export function OpinionControls({
  gameId,
  mustPlayLeft,
  compact = false,
  ...initial
}: State & { gameId: number; mustPlayLeft: number; compact?: boolean }) {
  const [state, setState] = useOptimistic<State, Partial<State>>(initial, (s, patch) => ({ ...s, ...patch }));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const update = (patch: Partial<State>) =>
    start(async () => {
      setState(patch);
      const res = await setOpinion(gameId, patch);
      setError(res.ok ? null : res.error);
    });

  const outOfVotes = !state.mustPlay && mustPlayLeft <= 0;
  const mustPlayTitle = state.mustPlay
    ? "Take back your must-play vote"
    : outOfVotes
      ? `All ${MUST_PLAY_LIMIT} must-play votes are in use`
      : `Use one of your must-play votes (${mustPlayLeft} of ${MUST_PLAY_LIMIT} left). It's freed once you play it.`;
  const toggleMustPlay = () => (outOfVotes ? setError(`${mustPlayTitle}. Take one back first.`) : update({ mustPlay: !state.mustPlay }));
  const wantTitle = "You'd like it on the table soon. Clears once you've played it.";

  if (compact) {
    const chip = (on: boolean) =>
      clsx(
        "rounded-full border px-2.5 py-1 text-xs",
        on ? "border-ink/80 bg-felt text-felt-ink" : "border-line bg-card text-slate hover:border-ink/40",
      );
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <div role="group" aria-label="How do you feel about it?" className="flex gap-1">
            {SENTIMENTS.map((s) => (
              <button
                key={s}
                type="button"
                title={SENTIMENT_LABEL[s].label}
                aria-label={SENTIMENT_LABEL[s].label}
                aria-pressed={state.sentiment === s}
                onClick={() => update({ sentiment: state.sentiment === s ? null : s })}
                className={clsx(
                  "grid size-9 place-items-center rounded-full border text-lg transition-transform active:translate-y-0.5",
                  state.sentiment === s ? "border-ink/80 bg-felt shadow-token" : "border-line bg-card grayscale-[60%] hover:grayscale-0",
                )}
              >
                {SENTIMENT_LABEL[s].emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={state.wantToPlay}
            title={wantTitle}
            onClick={() => update({ wantToPlay: !state.wantToPlay })}
            className={chip(state.wantToPlay)}
          >
            Want to play
          </button>
          <MustPlayButton on={state.mustPlay} disabled={outOfVotes} title={mustPlayTitle} onClick={toggleMustPlay} small />
        </div>
        {error && <p role="status" className="text-xs text-meeple-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="How do you feel about it?" className="flex flex-wrap gap-1.5">
        {SENTIMENTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={state.sentiment === s}
            onClick={() => update({ sentiment: state.sentiment === s ? null : s })}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-sm transition-transform active:translate-y-0.5",
              state.sentiment === s ? "border-ink/80 bg-felt text-felt-ink shadow-token" : "border-line bg-card hover:border-ink/40",
            )}
          >
            <span aria-hidden>{SENTIMENT_LABEL[s].emoji}</span> {SENTIMENT_LABEL[s].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2" title={wantTitle}>
          <input type="checkbox" checked={state.wantToPlay} onChange={(e) => update({ wantToPlay: e.target.checked })} className="size-4 accent-[var(--felt)]" />
          Want to play
        </label>
        <MustPlayButton on={state.mustPlay} disabled={outOfVotes} title={mustPlayTitle} onClick={toggleMustPlay} />
      </div>
      <p className="text-xs text-slate">
        {state.mustPlay
          ? "You've put a must-play vote on this. It comes back to you once you've played it."
          : `Must play: you get ${MUST_PLAY_LIMIT} at a time for the games you really want on the table. ${mustPlayLeft} left.`}{" "}
        Want to play clears once you&apos;ve played it, so tick it again if you still want to.{" "}
        <Link href="/about#votes" className="text-accent underline-offset-4 hover:underline">
          How votes work
        </Link>
      </p>
      {error && <p role="status" className="text-sm text-meeple-red">{error}</p>}
    </div>
  );
}

function MustPlayButton({ on, disabled, title, onClick, small }: { on: boolean; disabled: boolean; title: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={disabled}
      title={title}
      onClick={onClick}
      className={clsx(
        "rounded-full border transition-transform active:translate-y-0.5",
        small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        on ? "border-meeple-orange bg-meeple-orange/25 font-semibold text-ink shadow-token" : "border-line bg-card text-slate hover:border-meeple-orange/60",
        disabled && "opacity-50",
      )}
    >
      🔥 Must play
    </button>
  );
}
