import clsx from "clsx";
import { Empty } from "@/components/ui";
import type { FeatureConsensus } from "@/lib/taste";

/** Mechanics or categories as chips: green for liked, red for disliked. */
export function Chips({ items, tone, empty }: { items: string[]; tone: "good" | "bad"; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li key={t} className={clsx("rounded-full px-2.5 py-1 text-sm text-ink", tone === "good" ? "bg-meeple-green/15" : "bg-meeple-red/12")}>
          {t}
        </li>
      ))}
    </ul>
  );
}

/** A taste correlation in words. */
export const alike = (r: number) => (r >= 0.5 ? "very alike" : r >= 0.2 ? "alike" : r > -0.2 ? "mixed" : "opposite tastes");

/** "Alex likes, Jordan likes, Casey doesn't" for a feature that splits the group, keenest first. */
export const whoLikes = (f: FeatureConsensus, name: (id: string) => string | undefined) =>
  Object.entries(f.values)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => `${name(id)} ${v > 0 ? "likes" : "doesn't"}`)
    .join(", ");
