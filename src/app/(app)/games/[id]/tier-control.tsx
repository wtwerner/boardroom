"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { setGameTier } from "@/app/actions";
import { TIERS, type Tier } from "@/db/enums";

/**
 * Which ranking list a game is in. Its weight decides unless someone moves it; moving it
 * back to the list its weight picks clears the override, so a later BGG weight still counts.
 * The weight the lists split at comes from the server's config.
 */
export function TierControl({
  gameId,
  weight,
  override,
  byWeight,
  cutoff,
  labels,
}: {
  gameId: number;
  weight: number | null;
  override: Tier | null;
  /** The list its weight alone puts it in */
  byWeight: Tier;
  cutoff: number;
  labels: Record<Tier, string>;
}) {
  const [set, setSet] = useOptimistic(override);
  const [pending, start] = useTransition();
  const current = set ?? byWeight;
  const choose = (tier: Tier) =>
    start(async () => {
      const next = tier === byWeight ? null : tier;
      setSet(next);
      await setGameTier(gameId, next);
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
      <span>
        <Link href={current === "light" ? "/rankings?tier=light" : "/rankings"} className="underline-offset-4 hover:underline">
          Ranked with
        </Link>
      </span>
      <span className="flex gap-1 rounded-lg border border-line bg-table p-0.5" role="radiogroup" aria-label="Ranked with">
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={current === t}
            disabled={pending}
            onClick={() => current !== t && choose(t)}
            className={clsx("rounded-md px-2 py-0.5 font-medium", current === t ? "bg-card text-ink shadow-token" : "hover:text-ink")}
          >
            {labels[t]}
          </button>
        ))}
      </span>
      <span>
        {set === null
          ? weight === null
            ? "(no BGG weight yet)"
            : `(weight ${weight.toFixed(1)}: ${byWeight === "heavy" ? `${cutoff} and up` : `under ${cutoff}`})`
          : "(moved by hand)"}
      </span>
    </div>
  );
}
