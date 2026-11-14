"use client";

import { useState, useTransition } from "react";
import { acceptBggSuggestions } from "@/app/actions";
import { buttonClass } from "@/components/ui";

/** Takes every outlined face at once: the faces your BGG ratings suggest for the games you haven't rated here */
export function AcceptBggSuggestions({ count, summary }: { count: number; summary: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-ink/50 bg-card p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">
        <strong className="font-semibold">Your BGG ratings suggest a face for {count === 1 ? "1 game" : `${count} games`}</strong> you
        haven&apos;t rated here ({summary}), outlined below. Take them all, then change any that are off.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptBggSuggestions();
            setError(res.ok ? null : res.error);
          })
        }
        className={buttonClass("primary", "shrink-0")}
      >
        {pending ? "Rating…" : "Use them"}
      </button>
      {error && <p role="status" className="text-xs text-meeple-red">{error}</p>}
    </div>
  );
}
