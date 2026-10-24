"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { settleWhich } from "@/app/actions";
import type { Night } from "@/db/enums";

/** A name more than one player has, on one night: tap who it was */
export function WhichRow({
  night,
  playedOn,
  name,
  when,
  seatedId,
  choices,
}: {
  night: Night;
  playedOn: string;
  name: string;
  /** The night, as it reads: date and place */
  when: string;
  seatedId: number;
  choices: { id: number; label: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56">
        <div className="font-semibold">Which {name}?</div>
        <div className="text-xs text-slate">{when}</div>
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await settleWhich(night, playedOn, name, c.id);
                setError(res.ok ? null : res.error);
              })
            }
            className={clsx(
              "rounded-full border px-3 py-1 text-sm",
              c.id === seatedId ? "border-ink/70 bg-felt-soft font-medium" : "border-line text-slate hover:text-ink",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-meeple-red">{error}</p>}
    </div>
  );
}
