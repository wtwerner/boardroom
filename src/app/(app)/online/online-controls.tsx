"use client";

import { type ReactNode, useActionState, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { type ActionResult, loadBgaGames, setOpinion } from "@/app/actions";
import { buttonClass } from "@/components/ui";

/** "Up for it on BGA": used on the Online page and on game pages. */
export function OnlineToggle({ gameId, on: initial, label = "I'm up for it" }: { gameId: number; on: boolean; label?: string }) {
  const [on, setOn] = useOptimistic(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const toggle = () =>
    start(async () => {
      setOn(!on);
      const res = await setOpinion(gameId, { playOnline: !on });
      setError(res.ok ? null : res.error);
    });
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        aria-pressed={on}
        title="You'd play this on Board Game Arena with the group"
        onClick={toggle}
        className={clsx(
          "rounded-full border px-2.5 py-1 text-xs transition-transform active:translate-y-0.5",
          on ? "border-ink/80 bg-felt text-felt-ink shadow-token" : "border-line bg-card text-slate hover:border-ink/40",
        )}
      >
        {label}
      </button>
      {error && <span role="status" className="text-xs text-meeple-red">{error}</span>}
    </span>
  );
}

const subscribeToNothing = () => () => {};
function readCollapsed(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** A section whose heading folds it away. The server renders it open; a remembered fold applies once loaded. */
export function CollapsibleSection({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  const key = `online-collapsed:${id}`;
  const saved = useSyncExternalStore(subscribeToNothing, () => readCollapsed(key), () => false);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const collapsed = chosen ?? saved;
  const toggle = () => {
    setChosen(!collapsed);
    try {
      if (collapsed) localStorage.removeItem(key);
      else localStorage.setItem(key, "1");
    } catch {
      // Remembering it is a nicety; private windows can refuse it
    }
  };
  return (
    <section id={id} className="min-w-0 scroll-mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-wide text-lg">
          <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls={`${id}-body`} className="inline-flex items-center gap-1.5 text-left hover:text-accent">
            <ChevronDown aria-hidden className={clsx("size-4 shrink-0 transition-transform", collapsed && "-rotate-90")} />
            {title}
          </button>
        </h2>
        {!collapsed && action && <span className="shrink-0 whitespace-nowrap">{action}</span>}
      </div>
      <div id={`${id}-body`} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

export function LoadBgaButton() {
  const [state, action, pending] = useActionState<ActionResult | null>(() => loadBgaGames(), null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <button className={buttonClass("secondary")} disabled={pending}>{pending ? "Loading…" : "Load the game list from BGA"}</button>
      {state && !pending && <span className={clsx("text-xs", state.ok ? "text-slate" : "text-meeple-red")}>{state.ok ? state.message : state.error}</span>}
    </form>
  );
}
