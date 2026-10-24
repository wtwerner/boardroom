"use client";

import { useState, useTransition } from "react";
import { ignoreGameName, resolveGameName } from "@/app/actions";
import { buttonClass } from "@/components/ui";

export function ReviewRow({
  gameName,
  count,
  games,
}: {
  gameName: string;
  count: number;
  games: { id: number; name: string; year: number | null }[];
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listId = `games-${gameName.replace(/\W/g, "")}`;

  const match = () =>
    start(async () => {
      // Accept a picked title, a BGG URL, or a bare id
      const picked = games.find((g) => label(g) === value);
      const res = await resolveGameName(gameName, picked ? String(picked.id) : value);
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56">
        <div className="truncate font-semibold">&ldquo;{gameName}&rdquo;</div>
        <div className="text-xs text-slate">{count} {count === 1 ? "play" : "plays"}</div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <input
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pick a game or paste a BGG link"
          aria-label={`Game for "${gameName}"`}
          className="w-full rounded-lg border border-line bg-table px-3 py-2 text-sm"
        />
        <datalist id={listId}>
          {games.map((g) => (
            <option key={g.id} value={label(g)} />
          ))}
        </datalist>
        {error && <p className="text-xs text-meeple-red">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!value || pending} onClick={match} className={buttonClass("primary")}>
          {pending ? "Matching…" : "Match"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(`Delete ${count} play(s) logged as "${gameName}"?`) && start(() => ignoreGameName(gameName))}
          className={buttonClass("ghost")}
        >
          Not a game
        </button>
      </div>
    </div>
  );
}

const label = (g: { name: string; year: number | null }) => (g.year ? `${g.name} (${g.year})` : g.name);
