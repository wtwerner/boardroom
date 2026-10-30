"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MeepleColor, Night } from "@/db/enums";
import { type ActionResult, endNight, logPlay, movePlay } from "@/app/actions";
import { GameCover, PlayerChip, buttonClass } from "@/components/ui";
import { DeletePlayButton } from "../../plays/delete-play-button";
import { type Guest, type PlayerOption, WhoPlayed } from "../../plays/log-play-form";
import { EditPlayButton, PlayEditorProvider } from "../../plays/play-editor";

export type LoggedPlay = {
  id: number;
  gameId: number | null;
  name: string;
  thumbnail: string | null;
  playedOn: string;
  location: string | null;
  notes: string | null;
  source: "discord" | "manual";
  sourceRef: string | null;
  players: { playerId: number; name: string; color: MeepleColor | null }[];
};

/**
 * What was played on a night, logged as it's played: tap a game when it's on the table and it's
 * logged at once, for whoever's playing, at the end of the night's list (and its log post in
 * Discord). Everyone with the page open sees it, since the page refreshes when a night's plays
 * change. The order can be fixed with the arrows, and a game's players with its pencil.
 */
export function LiveLog({
  nightId,
  night,
  playedOn,
  location,
  plays,
  planned,
  games,
  players,
  seated: firstSeated,
  canPost,
  nightNames,
  postLabel,
  canEnd,
  collapsed,
}: {
  nightId: number;
  night: Night;
  playedOn: string;
  location: string | null;
  plays: LoggedPlay[];
  /** The games planned or brought that aren't logged yet, to tap */
  planned: { id: number; name: string }[];
  games: { id: number; name: string }[];
  players: PlayerOption[];
  /** Who's playing to start with: the last game's table, or who said they were going */
  seated: number[];
  canPost: Partial<Record<Night, boolean>>;
  nightNames: Record<Night, string>;
  /** Where its log post goes, for the checkbox */
  postLabel: string;
  /** It's on, with something logged: it can be ended */
  canEnd: boolean;
  /** Over and logged: logging more is tucked away */
  collapsed: boolean;
}) {
  const [seated, setSeated] = useState<Set<number>>(() => new Set(firstSeated));
  const [guests, setGuests] = useState<Guest[]>([]);
  const [post, setPost] = useState(true);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [logging, setLogging] = useState<Set<number>>(() => new Set());
  const [other, setOther] = useState("");
  const [pending, start] = useTransition();
  const table = new Set(plays.flatMap((p) => p.players.map((s) => s.playerId)));

  const log = (gameId: number) => {
    if (seated.size + guests.length === 0) return setStatus({ ok: false, error: "Pick who's playing first." });
    const form = new FormData();
    form.append("game", String(gameId));
    form.set("playedOn", playedOn);
    form.set("night", night);
    for (const id of seated) form.append("players", String(id));
    for (const g of guests) form.append(g.isNew ? "newGuests" : "guests", g.name);
    if (location) form.set("location", location);
    if (post && canPost[night]) form.set("postToDiscord", "on");
    // The night's list shows what's logged already, so there's no need to check Discord first
    form.set("allowDuplicate", "1");
    setLogging((s) => new Set([...s, gameId]));
    start(async () => {
      const res = await logPlay(null, form);
      setStatus(res);
      // Someone new is a player now: seat them as one, so the next game doesn't make them again
      if (res.ok && res.playerIds?.length) {
        setSeated((s) => new Set([...s, ...res.playerIds!]));
        setGuests((gs) => gs.filter((g) => !g.isNew));
      }
      setLogging((s) => new Set([...s].filter((id) => id !== gameId)));
    });
  };

  const ticking = (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <p className="text-slate">
          {plays.length ? "Tap the next one when it hits the table." : "Tap a game when it hits the table. It's logged right away, and everyone sees it here."}
        </p>
        {planned.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {planned.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={logging.has(g.id)}
                onClick={() => log(g.id)}
                className={clsx("rounded-full border border-line px-3 py-1 text-sm hover:border-ink/70", logging.has(g.id) && "animate-pulse bg-felt-soft")}
              >
                {logging.has(g.id) ? `Logging ${g.name}…` : `+ ${g.name}`}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-wrap items-center gap-2">
          <span className="sr-only">Something else</span>
          <select
            value={other}
            onChange={(e) => {
              const id = Number(e.target.value);
              setOther("");
              if (id) log(id);
            }}
            className="min-w-0 max-w-full flex-1 rounded-lg border border-line bg-table px-3 py-2 text-base sm:max-w-xs sm:text-sm"
          >
            <option value="">{planned.length ? "Something else…" : "Choose a game…"}</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm">Who&apos;s playing</legend>
        <WhoPlayed players={players} seated={seated} onSeated={setSeated} guests={guests} onGuests={setGuests} />
      </fieldset>

      {canPost[night] && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="size-4 accent-[var(--felt)]" />
          {postLabel}
        </label>
      )}

      {status && (
        <p role="status" className={status.ok ? "text-sm text-slate" : "text-sm text-meeple-red"}>
          {status.ok ? status.message : status.error}
        </p>
      )}

      {canEnd && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" disabled={pending} onClick={() => start(async () => setStatus(await endNight(nightId)))} className={buttonClass("secondary")}>
            That&apos;s everything
          </button>
          <span className="text-sm text-slate">Ends the night now, rather than tomorrow morning.</span>
        </div>
      )}
    </div>
  );

  return (
    <PlayEditorProvider games={games} players={players} canPost={canPost} nightNames={nightNames}>
      {plays.length > 0 && (
        <ol className="mb-3 space-y-2">
          {plays.map((p, i) => (
            <li key={p.id} className="group flex items-center gap-3 rounded-xl border border-line bg-card p-3">
              <GameCover src={p.thumbnail} name={p.name} size="sm" />
              <span className="min-w-0 flex-1">
                {p.gameId ? (
                  <Link href={`/games/${p.gameId}`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{p.name}</span>
                )}
                {/* Its players, when they aren't everyone who played that night */}
                {p.players.length !== table.size && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.players.map((s) => (
                      <PlayerChip key={s.playerId} name={s.name} color={s.color} />
                    ))}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center">
                {plays.length > 1 && (
                  <>
                    <MoveButton label={`Move ${p.name} up`} disabled={i === 0} onClick={() => start(async () => void (await movePlay(p.id, -1)))}>
                      <ArrowUp className="size-4" />
                    </MoveButton>
                    <MoveButton label={`Move ${p.name} down`} disabled={i === plays.length - 1} onClick={() => start(async () => void (await movePlay(p.id, 1)))}>
                      <ArrowDown className="size-4" />
                    </MoveButton>
                  </>
                )}
                <EditPlayButton
                  play={{
                    playId: p.id,
                    name: p.name,
                    gameId: p.gameId,
                    playedOn: p.playedOn,
                    location: p.location,
                    notes: p.notes,
                    playerIds: p.players.map((s) => s.playerId),
                    night,
                    discord: p.source === "manual" ? (p.sourceRef ? "app-post" : "none") : "hand-post",
                  }}
                />
                <DeletePlayButton id={p.id} name={p.name} postedByApp={p.source === "manual" && Boolean(p.sourceRef)} />
              </span>
            </li>
          ))}
        </ol>
      )}
      {collapsed ? (
        <details id="log" className="group/log scroll-mt-6 rounded-xl border border-line bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
            <span className="group-open/log:hidden">+ Log another game from this night</span>
            <span className="hidden group-open/log:inline">Log another game from this night</span>
          </summary>
          <div className="border-t border-line p-4">{ticking}</div>
        </details>
      ) : (
        <div id="log" className="scroll-mt-6 rounded-xl border border-line bg-card p-4">
          {ticking}
        </div>
      )}
    </PlayEditorProvider>
  );
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-slate hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}
