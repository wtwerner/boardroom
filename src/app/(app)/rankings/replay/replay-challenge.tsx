"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Undo2 } from "lucide-react";
import { saveRanking } from "@/app/actions";
import type { Tier } from "@/db/enums";
import { GameCover, Panel, buttonClass } from "@/components/ui";
import { type Comparison, canFinish, nextPair, questionBudget, replayResult, seededRandom } from "@/lib/pairwise";

type Game = { id: number; name: string; thumbnail: string | null; image: string | null };

const subscribeToNothing = () => () => {};
function readSaved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSaved(key: string, comparisons: Comparison[] | null) {
  try {
    if (comparisons?.length) localStorage.setItem(key, JSON.stringify(comparisons));
    else localStorage.removeItem(key);
  } catch {
    // Resuming later is a nicety; private windows can refuse it
  }
}

/** Answers from an unfinished replay, minus any about games that have since left the pool. */
function parseSaved(raw: string | null, ids: Set<number>): Comparison[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Comparison =>
        typeof c?.a === "number" &&
        typeof c?.b === "number" &&
        ids.has(c.a) &&
        ids.has(c.b) &&
        (c.winner === null || c.winner === c.a || c.winner === c.b),
    );
  } catch {
    return [];
  }
}

/**
 * Re-ranks every game from scratch with "which would you rather play?" questions,
 * chosen and scored by lib/pairwise. Answers are kept in this browser until the
 * result is saved, so a long replay can be finished later.
 */
export function ReplayChallenge({ userId, tier, games, current }: { userId: string; tier: Tier; games: Game[]; current: number[] }) {
  const router = useRouter();
  const storageKey = `ranking-replay:${userId}:${tier}`;
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const ids = useMemo(() => games.map((g) => g.id), [games]);
  // The server renders a fresh start; answers saved in this browser take over once loaded
  const saved = useSyncExternalStore(subscribeToNothing, () => readSaved(storageKey), () => null);
  const [answers, setAnswers] = useState<Comparison[] | null>(null);
  const comparisons = useMemo(() => answers ?? parseSaved(saved, new Set(ids)), [answers, saved, ids]);
  const [extra, setExtra] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const target = questionBudget(ids.length) + extra;
  const showResult = reviewing || comparisons.length >= target;
  const ready = useMemo(() => canFinish(ids, comparisons), [ids, comparisons]);

  // Seeded from the answers so far, so the question doesn't change between renders;
  // which side each game is on is random, so neither side gets picked out of habit
  const question = useMemo(() => {
    const last = comparisons.at(-1);
    const random = seededRandom(comparisons.length * 7919 + (last ? last.a * 31 + last.b : 0));
    const pair = nextPair(ids, comparisons, random);
    return pair && (random() < 0.5 ? pair : ([pair[1], pair[0]] as const));
  }, [ids, comparisons]);

  const record = (next: Comparison[]) => {
    setAnswers(next);
    writeSaved(storageKey, next);
  };
  const choose = (winner: number | null) => {
    if (!question || showResult) return;
    record([...comparisons, { a: question[0], b: question[1], winner }]);
  };
  const undo = () => {
    record(comparisons.slice(0, -1));
    setReviewing(false);
  };
  const startOver = () => {
    record([]);
    setExtra(0);
    setReviewing(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !question || showResult) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const winner = { ArrowLeft: question[0], ArrowRight: question[1], ArrowDown: null }[e.key];
      if (winner === undefined) return;
      e.preventDefault();
      choose(winner);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (showResult) {
    const result = replayResult(ids, comparisons, current);
    const before = new Map(current.map((id, i) => [id, i]));
    const save = () =>
      start(async () => {
        setError(null);
        try {
          await saveRanking(tier, result.order);
          writeSaved(storageKey, null);
          router.push(tier === "light" ? "/rankings?tier=light" : "/rankings");
        } catch {
          setError("That didn't save. Try again in a minute; your answers are still here.");
        }
      });

    return (
      <Panel className="space-y-4 p-4">
        <div>
          <h2 className="font-wide text-lg">Where your answers put them</h2>
          <p className="mt-1 text-sm text-slate">
            From {comparisons.length} answers.{" "}
            {result.decided > 0 &&
              (result.agreed === result.decided
                ? "Every pick fits this order."
                : `${result.agreed} of ${result.decided} picks fit this order; the rest were close calls, and this is the order that fits best overall.`)}{" "}
            Arrows show the change from your current list.
          </p>
        </div>
        <ol className="space-y-1.5">
          {result.order.map((id, i) => {
            const g = byId.get(id)!;
            const was = before.get(id);
            const moved = was === undefined ? null : was - i;
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-line bg-card py-1.5 pr-3 pl-2">
                <span className="font-display tabular w-7 text-right text-lg text-accent">{i + 1}</span>
                <GameCover src={g.thumbnail} name={g.name} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <Movement moved={moved} />
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={saving} className={buttonClass("primary")}>
            {saving ? "Saving…" : "Make this my ranking"}
          </button>
          <button
            type="button"
            onClick={() => {
              setReviewing(false);
              setExtra(Math.max(extra, comparisons.length - questionBudget(ids.length)) + Math.max(3, Math.ceil(ids.length / 2)));
            }}
            className={buttonClass("secondary")}
          >
            Ask me a few more
          </button>
          <button type="button" onClick={undo} className={buttonClass("ghost")}>
            <Undo2 className="size-4" /> Undo last answer
          </button>
          <button type="button" onClick={startOver} className={buttonClass("ghost")}>
            Start over
          </button>
        </div>
        {error && <p className="text-sm text-meeple-red" role="alert">{error}</p>}
      </Panel>
    );
  }

  if (!question) return null;
  const left = byId.get(question[0])!;
  const right = byId.get(question[1])!;

  return (
    <section aria-labelledby="replay-title" className="rounded-xl border border-ink/70 bg-card p-4 shadow-token">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="replay-title" className="font-wide text-base">Which would you rather play?</h2>
        <span className="tabular text-xs text-slate">
          {comparisons.length} of {target}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(100 * comparisons.length) / target}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[left, right].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => choose(g.id)}
            className="group rounded-xl border border-line p-2 text-left transition-transform hover:border-ink/60 active:translate-y-0.5"
          >
            <GameCover src={g.thumbnail} image={g.image} name={g.name} size="fluid" sizes="(min-width: 768px) 20rem, 45vw" />
            <span className="mt-2 line-clamp-2 block text-sm font-semibold group-hover:underline">{g.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => choose(null)} className={buttonClass("secondary", "px-3 py-1.5 text-xs")}>
          About the same
        </button>
        {comparisons.length > 0 && (
          <button type="button" onClick={undo} className={buttonClass("ghost", "px-3 py-1.5 text-xs")}>
            <Undo2 className="size-3.5" /> Undo
          </button>
        )}
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={!ready}
          title={ready ? undefined : "Once every game has come up at least twice"}
          className={buttonClass("ghost", "ml-auto px-3 py-1.5 text-xs")}
        >
          Stop here and see the result
        </button>
      </div>
      <p className="mt-3 hidden text-xs text-slate sm:block">Keys: ← left, → right, ↓ about the same.</p>
    </section>
  );
}

function Movement({ moved }: { moved: number | null }) {
  if (moved === null) return <span className="w-10 text-right text-xs font-semibold text-accent">new</span>;
  if (moved === 0) return <span className="w-10 text-right text-xs text-slate">–</span>;
  const Icon = moved > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={moved > 0 ? "flex w-10 items-center justify-end text-xs text-meeple-green" : "flex w-10 items-center justify-end text-xs text-slate"}
      aria-label={moved > 0 ? `up ${moved}` : `down ${-moved}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(moved)}
    </span>
  );
}
