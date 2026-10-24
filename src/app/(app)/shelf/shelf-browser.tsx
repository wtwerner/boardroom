"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor, Sentiment } from "@/db/enums";
import { GameCover, Meeple, bestAt, formatDate, playerRange, playtime } from "@/components/ui";
import type { ShelfGame } from "@/lib/queries";
import { SENTIMENT_LABEL } from "@/lib/sentiment";

type Member = { id: string; name: string; color: MeepleColor | null };
type Sort = "name" | "plays" | "stale" | "rating" | "weight" | "loved" | "bet";

const subscribeToNothing = () => () => {};
function readSavedView(): "grid" | "list" {
  try {
    return localStorage.getItem("shelf-view") === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

const SENTIMENT_SCORE: Record<Sentiment, number> = { love: 2, like: 1, meh: -1, nope: -2 };

export function ShelfBrowser({
  games,
  onBga: onBgaIds,
  members,
  myId,
  initialOwner,
  shame,
  initialShame,
}: {
  games: ShelfGame[];
  /** Games that can be played on Board Game Arena */
  onBga: number[];
  members: Member[];
  myId: string;
  initialOwner: string | null;
  /** The shelf of shame, best bets first, with the group's chance of liking each */
  shame: { id: number; chance: number | null }[];
  initialShame: boolean;
}) {
  const [query, setQuery] = useState("");
  // "Plays 4" keeps anything 4 can play; "Best at 4" only what BGG's voters say is best at 4
  const [players, setPlayers] = useState<{ count: number; best: boolean } | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [owner, setOwner] = useState<string | null>(initialOwner);
  const [shameOnly, setShameOnly] = useState(initialShame);
  const [sort, setSort] = useState<Sort>(initialShame ? "bet" : "name");
  const shameRank = useMemo(() => new Map(shame.map((g, i) => [g.id, i])), [shame]);
  const chanceOf = useMemo(() => new Map(shame.map((g) => [g.id, g.chance])), [shame]);
  const [unrated, setUnrated] = useState(false);
  const [bgaOnly, setBgaOnly] = useState(false);
  const onBga = useMemo(() => new Set(onBgaIds), [onBgaIds]);
  // The server always renders covers; a remembered "list" choice applies once loaded
  const savedView = useSyncExternalStore(subscribeToNothing, readSavedView, () => "grid" as const);
  const [chosenView, setChosenView] = useState<"grid" | "list" | null>(null);
  const view = chosenView ?? savedView;
  const chooseView = (v: "grid" | "list") => {
    setChosenView(v);
    try {
      localStorage.setItem("shelf-view", v);
    } catch {
      // Remembering the view is a nicety; private windows can refuse it
    }
  };
  const q = useDeferredValue(query.trim().toLowerCase());
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const shown = useMemo(() => {
    const out = games.filter(
      (g) =>
        (!q || g.name.toLowerCase().includes(q)) &&
        (players === null ||
          (players.best
            ? (g.bestPlayers ?? []).includes(players.count)
            : (g.minPlayers ?? 1) <= players.count && (g.maxPlayers ?? 99) >= players.count)) &&
        (minutes === null || (g.minPlaytime ?? 0) <= minutes) &&
        (owner === null || g.ownerIds.includes(owner)) &&
        (!unrated || !g.sentiments.some((s) => s.userId === myId)) &&
        (!bgaOnly || onBga.has(g.id)) &&
        (!shameOnly || shameRank.has(g.id)),
    );
    const loved = (g: ShelfGame) => g.sentiments.reduce((n, s) => n + SENTIMENT_SCORE[s.sentiment], 0);
    const cmp: Record<Sort, (a: ShelfGame, b: ShelfGame) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      plays: (a, b) => b.plays - a.plays,
      stale: (a, b) => (a.lastPlayed ?? "").localeCompare(b.lastPlayed ?? ""),
      rating: (a, b) => (b.bggRating ?? 0) - (a.bggRating ?? 0),
      weight: (a, b) => (b.weight ?? 0) - (a.weight ?? 0),
      loved: (a, b) => loved(b) - loved(a),
      bet: (a, b) => (shameRank.get(a.id) ?? Infinity) - (shameRank.get(b.id) ?? Infinity),
    };
    return out.sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name));
  }, [games, q, players, minutes, owner, sort, unrated, bgaOnly, onBga, myId, shameOnly, shameRank]);

  const select = "min-w-0 rounded-lg border border-line bg-card px-2.5 py-2 text-sm";

  return (
    <div>
      {/* Phones: search across the top, the four selects two by two, then the toggles */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="relative col-span-2 sm:min-w-48 sm:flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${games.length} games`}
            aria-label="Search games"
            className="w-full rounded-lg border border-line bg-card py-2 pr-3 pl-9 text-sm"
          />
        </label>
        <select
          aria-label="Player count"
          className={select}
          value={players ? `${players.best ? "best" : "plays"}:${players.count}` : ""}
          onChange={(e) => {
            const [mode, n] = e.target.value.split(":");
            setPlayers(n ? { count: Number(n), best: mode === "best" } : null);
          }}
        >
          <option value="">Any players</option>
          <optgroup label="Best at (BGG voters)">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={`best:${n}`}>Best at {n}</option>)}
          </optgroup>
          <optgroup label="Plays">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={`plays:${n}`}>Plays {n}</option>)}
          </optgroup>
        </select>
        <select aria-label="Time available" className={select} value={minutes ?? ""} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Any length</option>
          {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>Under {m >= 120 ? `${m / 60} hours` : `${m} min`}</option>)}
        </select>
        <select aria-label="Owner" className={select} value={owner ?? ""} onChange={(e) => setOwner(e.target.value || null)}>
          <option value="">Anyone&apos;s</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.id === myId ? "Mine" : `${m.name}'s`}</option>)}
        </select>
        <select aria-label="Sort" className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="name">A–Z</option>
          <option value="loved">Group&apos;s favorites</option>
          <option value="plays">Most played</option>
          <option value="stale">Longest since played</option>
          <option value="rating">BGG rating</option>
          <option value="weight">Heaviest</option>
          {shameOnly && <option value="bet">Best bets</option>}
        </select>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:contents">
          <label className="flex items-center gap-1.5 px-1 text-sm">
            <input type="checkbox" checked={unrated} onChange={(e) => setUnrated(e.target.checked)} />
            I haven&apos;t rated
          </label>
          <label className="flex items-center gap-1.5 px-1 text-sm" title="Owned, never played, and the group would likely enjoy it">
            <input
              type="checkbox"
              checked={shameOnly}
              onChange={(e) => {
                setShameOnly(e.target.checked);
                // Best bets first when it's turned on; that order means nothing once it's off
                if (e.target.checked) setSort("bet");
                else if (sort === "bet") setSort("name");
              }}
            />
            Shelf of shame
          </label>
          {onBga.size > 0 && (
            <label className="flex items-center gap-1.5 px-1 text-sm" title="Can be played on Board Game Arena">
              <input type="checkbox" checked={bgaOnly} onChange={(e) => setBgaOnly(e.target.checked)} />
              On BGA
            </label>
          )}
          <div role="group" aria-label="View" className="ml-auto flex rounded-lg border border-line bg-card p-0.5">
            {([["grid", LayoutGrid, "Covers"], ["list", List, "List with details"]] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={label}
                title={label}
                onClick={() => chooseView(v)}
                className={clsx("rounded-md p-1.5", view === v ? "bg-felt text-felt-ink" : "text-slate hover:text-ink")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-slate" role="status">
        {shown.length} {shown.length === 1 ? "game" : "games"}
        {shameOnly &&
          ". Owned, never played together, and likely to go down well: the percentage is the group's chance of liking it, as Discover works it out. Legacy games, games for 2 at most and ones the group turned down are left out."}
      </p>

      {view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="group block">
                <GameCover src={g.thumbnail} image={g.image} name={g.name} size="fluid" sizes="(min-width: 1024px) 18vw, (min-width: 640px) 30vw, 45vw" />
                <div className="mt-2 flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-semibold group-hover:underline">{g.name}</span>
                  <span className="flex shrink-0 pt-0.5" aria-label={`Owned by ${g.ownerIds.map((id) => memberById.get(id)?.name).join(", ")}`}>
                    {g.ownerIds.map((id) => <Meeple key={id} color={memberById.get(id)?.color ?? null} className="-ml-1 size-3.5 first:ml-0" />)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate">
                  {[playerRange(g.minPlayers, g.maxPlayers), bestAt(g.bestPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.plays ? `${g.plays}× played` : "unplayed"].filter(Boolean).join(", ")}
                </div>
                {shameOnly && chanceOf.get(g.id) != null && (
                  <div className="tabular mt-1 text-xs font-semibold text-accent">{Math.round(chanceOf.get(g.id)! * 100)}% group chance</div>
                )}
                {g.sentiments.length > 0 && (
                  <div className="mt-1 flex gap-1 text-sm leading-none">
                    {g.sentiments.map((s) => (
                      <span key={s.userId} title={`${memberById.get(s.userId)?.name}: ${s.sentiment}`}>{SENTIMENT_LABEL[s.sentiment].emoji}</span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ShelfTable games={shown} memberById={memberById} chances={shameOnly ? chanceOf : null} />
      )}
    </div>
  );
}

function ShelfTable({ games, memberById, chances }: { games: ShelfGame[]; memberById: Map<string, Member>; chances: Map<number, number | null> | null }) {
  const th = "px-2 py-2 text-left text-xs font-medium text-slate";
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={clsx(th, "pl-3")}>Game</th>
            <th className={th}>Players</th>
            <th className={th}>Time</th>
            <th className={th} title="BGG weight, 1 (light) to 5 (heavy)">Weight</th>
            <th className={th}>BGG</th>
            <th className={th}>Played</th>
            <th className={th}>Owners</th>
            <th className={clsx(th, "pr-3")}>The group</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {games.map((g) => (
            <tr key={g.id} className="hover:bg-felt-soft/50">
              <td className="py-1.5 pr-2 pl-3">
                <Link href={`/games/${g.id}`} className="flex items-center gap-2.5 hover:underline">
                  <GameCover src={g.thumbnail} name={g.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block max-w-64 truncate font-medium">{g.name}</span>
                    {g.year && <span className="block text-xs text-slate">{g.year}</span>}
                  </span>
                </Link>
              </td>
              <td className="tabular px-2 whitespace-nowrap">
                {playerRange(g.minPlayers, g.maxPlayers) ?? "–"}
                {g.bestPlayers?.length ? <span className="block text-xs text-slate">{bestAt(g.bestPlayers)}</span> : null}
              </td>
              <td className="tabular px-2 whitespace-nowrap">{playtime(g.minPlaytime, g.maxPlaytime) ?? "–"}</td>
              <td className="tabular px-2">{g.weight ? g.weight.toFixed(1) : "–"}</td>
              <td className="tabular px-2">{g.bggRating ? g.bggRating.toFixed(1) : "–"}</td>
              <td className="tabular px-2 whitespace-nowrap">
                {g.plays ? `${g.plays}×` : <span className="text-slate">never</span>}
                {g.lastPlayed && <span className="block text-xs text-slate">{formatDate(g.lastPlayed)}</span>}
                {chances?.get(g.id) != null && <span className="block text-xs font-semibold text-accent">{Math.round(chances.get(g.id)! * 100)}% group chance</span>}
              </td>
              <td className="px-2">
                <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                  {g.ownerIds.map((id) => (
                    <Link key={id} href={`/people/${id}`} className="inline-flex items-center gap-1 hover:underline">
                      <Meeple color={memberById.get(id)?.color ?? null} className="size-3.5" />
                      {memberById.get(id)?.name}
                    </Link>
                  ))}
                </span>
              </td>
              <td className="pr-3 pl-2 text-xs whitespace-nowrap">
                {g.sentiments.map((s) => (
                  <span key={s.userId} title={`${memberById.get(s.userId)?.name}: ${SENTIMENT_LABEL[s.sentiment].label}`}>
                    {SENTIMENT_LABEL[s.sentiment].emoji}
                  </span>
                ))}
                {g.mustPlay.length > 0 && <span className="ml-1.5" title={g.mustPlay.map((id) => memberById.get(id)?.name).join(", ")}>🔥{g.mustPlay.length}</span>}
                {g.wantToPlay.length > 0 && <span className="ml-1.5 text-slate">{g.wantToPlay.length} want to play</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
