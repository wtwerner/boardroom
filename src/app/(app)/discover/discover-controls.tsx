"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { type ActionResult, addSuggestion, askClaudeForPicks, loadCatalog, setOpinion, takeOffBuyList, unwantGame, wantGame } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import type { Night } from "@/db/enums";

type View = "group" | "you";
const discoverHref = (view: View, twoPlayer: boolean, night: Night) => {
  const q = new URLSearchParams({ ...(view === "you" && { view }), ...(twoPlayer && { two: "1" }), ...(night === "casual" && { night }) }).toString();
  return q ? `/discover?${q}` : "/discover";
};

/**
 * Discover's two views, and the group view for each night. All are rendered up front from
 * the same recommendations, so switching is instant; the URL follows along so a reload or a
 * shared link opens the same tab. The 2-player switch changes the data, so it's a real navigation.
 */
export function DiscoverTabs({
  initial,
  initialNight,
  twoPlayer,
  group,
  nightNames,
  you,
}: {
  initial: View;
  initialNight: Night;
  twoPlayer: boolean;
  /** The group view for each of the group's nights: its table, its kind of game and its own Claude picks */
  group: Partial<Record<Night, ReactNode>>;
  /** What each night is called, from the server's config */
  nightNames: Record<Night, string>;
  you: ReactNode;
}) {
  const [view, setView] = useState<View>(initial);
  const [night, setNight] = useState<Night>(initialNight);
  const nights = Object.keys(group) as Night[];
  const choose = (v: View, n: Night = night) => {
    setView(v);
    setNight(n);
    window.history.replaceState(null, "", discoverHref(v, twoPlayer, n));
  };
  const tabs = [
    ["group", "For the group"],
    ["you", "For you"],
  ] as const;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Discover views" className="flex w-fit gap-1 rounded-lg border border-line bg-table p-1">
          {tabs.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`discover-tab-${v}`}
              aria-selected={view === v}
              aria-controls={`discover-${v}`}
              onClick={() => choose(v)}
              className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", view === v ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "group" && nights.length > 1 && (
          <div role="group" aria-label="Which kind of event" className="flex w-fit gap-1 rounded-lg border border-line bg-table p-1">
            {nights.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={night === n}
                onClick={() => choose(view, n)}
                className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", night === n ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink")}
              >
                {nightNames[n]}
              </button>
            ))}
          </div>
        )}
        <Link
          href={discoverHref(view, !twoPlayer, night)}
          role="switch"
          aria-checked={twoPlayer}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1.5 pr-3 pl-2 text-sm hover:border-ink/40"
        >
          <span className={clsx("grid size-4 place-items-center rounded border", twoPlayer ? "border-felt bg-felt text-felt-ink" : "border-line")}>
            {twoPlayer && <Check className="size-3" strokeWidth={3} />}
          </span>
          Include 2-player games
        </Link>
      </div>
      {tabs.map(([v]) => (
        <div key={v} role="tabpanel" id={`discover-${v}`} aria-labelledby={`discover-tab-${v}`} hidden={view !== v} className="space-y-8">
          {v === "group"
            ? nights.map((n) => (
                <div key={n} hidden={night !== n} className="space-y-8">
                  {group[n]}
                </div>
              ))
            : you}
        </div>
      ))}
    </div>
  );
}

const subscribeToNothing = () => () => {};
function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Claude's picks, folded away on request. The choice is remembered in this browser
 * for this batch of picks only (`batch` changes when Claude is asked again), so new
 * picks always show up open.
 */
export function CollapsiblePicks({
  storageKey,
  batch,
  count,
  title,
  intro,
  actions,
  children,
}: {
  storageKey: string;
  batch: string;
  count: number;
  title: ReactNode;
  intro: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  // The server renders it open; a remembered "hidden" applies once loaded
  const saved = useSyncExternalStore(subscribeToNothing, () => readStorage(storageKey), () => null);
  const [chosen, setChosen] = useState<{ batch: string; hidden: boolean } | null>(null);
  const hidden = count > 0 && (chosen?.batch === batch ? chosen.hidden : saved === batch);
  const toggle = () => {
    setChosen({ batch, hidden: !hidden });
    try {
      if (hidden) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, batch);
    } catch {
      // Remembering it is a nicety; private windows can refuse it
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          {title}
          {!hidden && intro}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {count > 0 && (
            <button type="button" onClick={toggle} aria-expanded={!hidden} aria-controls={`${storageKey}-body`} className={buttonClass("ghost", "px-2.5 py-1.5 text-xs")}>
              {hidden ? (
                <>
                  Show {count} {count === 1 ? "pick" : "picks"} <ChevronDown className="size-3.5" />
                </>
              ) : (
                <>
                  Hide <ChevronUp className="size-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <div id={`${storageKey}-body`} hidden={hidden}>
        {children}
      </div>
    </>
  );
}

/** Claude replaces its picks with a fresh list, each checked on BGG and scored against everyone's taste. */
export function FindIdeasButton({ scope, night, label }: { scope: "group" | "me"; night?: Night; label: string }) {
  const [state, action, pending] = useActionState<ActionResult | null>(() => askClaudeForPicks(scope, night), null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      {state && !pending && <span className={clsx("text-xs", state.ok ? "text-slate" : "text-meeple-red")}>{state.ok ? state.message : state.error}</span>}
      {pending && <span className="text-xs text-slate">Asking Claude and checking BGG. This takes a minute.</span>}
      <button className={buttonClass("secondary", "py-1.5")} disabled={pending}>
        <Sparkles className="size-4" />
        {pending ? "Finding…" : label}
      </button>
    </form>
  );
}

export function AddSuggestionForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const res = await addSuggestion(prev, form);
    if (res.ok) ref.current?.reset();
    return res;
  }, null);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row">
      <input name="name" required placeholder="Game name" aria-label="Game name" className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
      <input name="reason" placeholder="Why? (optional)" aria-label="Why" className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
      <button className={buttonClass("primary")} disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      {state && !state.ok && <p className="text-sm text-meeple-red sm:hidden">{state.error}</p>}
    </form>
  );
}

/**
 * "Want it" puts it on the buy list with your vote, and tapping it again takes the vote back
 * (off the list once nobody wants it); "Not for me" rates it so it stops being suggested to you.
 */
export function PickActions({ gameId, wanted, notForMe }: { gameId: number; wanted: boolean; notForMe: boolean }) {
  const [state, setState] = useOptimistic({ wanted, notForMe }, (s, patch: Partial<{ wanted: boolean; notForMe: boolean }>) => ({ ...s, ...patch }));
  const [, start] = useTransition();
  const chip = "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs";
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        aria-pressed={state.wanted}
        onClick={() =>
          start(async () => {
            if (state.wanted) {
              setState({ wanted: false });
              await unwantGame(gameId);
            } else {
              setState({ wanted: true, notForMe: false });
              await wantGame(gameId);
            }
          })
        }
        title={state.wanted ? "Tap to take your vote back" : undefined}
        className={clsx(chip, "group", state.wanted ? "border-accent/60 font-semibold text-accent hover:border-meeple-red/50 hover:text-meeple-red" : "border-line bg-card hover:border-ink/40")}
      >
        {state.wanted ? (
          <>
            <Check className="size-3.5 group-hover:hidden" />
            <X className="hidden size-3.5 group-hover:block" />
          </>
        ) : (
          <Plus className="size-3.5" />
        )}
        {state.wanted ? "On the buy list" : "Want it"}
      </button>
      <button
        type="button"
        aria-pressed={state.notForMe}
        onClick={() =>
          start(async () => {
            setState({ notForMe: !state.notForMe });
            await setOpinion(gameId, { sentiment: state.notForMe ? null : "nope" });
          })
        }
        className={clsx(chip, state.notForMe ? "border-meeple-red/50 text-meeple-red" : "border-line bg-card text-slate hover:border-ink/40")}
      >
        Not for me
      </button>
    </div>
  );
}

/** On the buy list: take it off for everyone (clears its votes), without saying it's not for you */
export function TakeOffBuyList({ suggestionId, name }: { suggestionId: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Take ${name} off the buy list? Everyone's votes on it go too.`)) start(async () => void (await takeOffBuyList(suggestionId)));
      }}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs text-slate hover:border-ink/40 hover:text-ink"
    >
      <X className="size-3.5" /> Take it off
    </button>
  );
}

export function LoadCatalogButton() {
  const [state, action, pending] = useActionState<ActionResult | null>(() => loadCatalog(), null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <button className={buttonClass("secondary")} disabled={pending}>{pending ? "Loading… (about 20 seconds)" : "Load popular games from BGG"}</button>
      {state && !pending && <span className={clsx("text-xs", state.ok ? "text-slate" : "text-meeple-red")}>{state.ok ? state.message : state.error}</span>}
    </form>
  );
}
