import Link from "next/link";
import clsx from "clsx";
import { TIERS, type Tier } from "@/db/enums";
import { TIER_LABEL } from "@/lib/tier";

/** Rating every game and ranking a top 10 are the two halves of "what do you think?". */
export function RankingTabs({ current }: { current: "rank" | "rate" }) {
  const tab = (active: boolean) =>
    clsx(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink",
    );
  return (
    <nav aria-label="Rankings views" className="flex gap-1 rounded-lg border border-line bg-table p-1">
      <Link href="/rankings/rate" aria-current={current === "rate" ? "page" : undefined} className={tab(current === "rate")}>
        Rate games
      </Link>
      <Link href="/rankings" aria-current={current === "rank" ? "page" : undefined} className={tab(current === "rank")}>
        Rank games
      </Link>
    </nav>
  );
}

/** Reads `?tier=` from search params: the heavy games unless it says casual. */
export const tierParam = (value: string | string[] | undefined): Tier => (value === "light" ? "light" : "heavy");

export const tierHref = (path: string, tier: Tier) => (tier === "light" ? `${path}?tier=light` : path);

/** Each tier is its own ranking: games are only compared with their own kind. `waiting` counts the new games to place in each. */
export function TierSwitch({ current, path, waiting }: { current: Tier; path: string; waiting?: Partial<Record<Tier, number>> }) {
  const tab = (active: boolean) =>
    clsx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink");
  return (
    <nav aria-label="Which games" className="flex w-fit gap-1 rounded-lg border border-line bg-table p-1">
      {TIERS.map((t) => (
        <Link key={t} href={tierHref(path, t)} aria-current={current === t ? "page" : undefined} className={tab(current === t)}>
          {TIER_LABEL[t]}
          {!!waiting?.[t] && (
            <span className="tabular rounded-full bg-meeple-yellow px-1.5 text-[0.7rem] font-semibold text-ink">
              {waiting[t]}
              <span className="sr-only"> new</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
