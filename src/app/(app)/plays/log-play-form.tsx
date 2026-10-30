"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { type ActionResult, logPlay, updatePlay } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import type { Night } from "@/db/enums";
import { Meeple, buttonClass } from "@/components/ui";
import { formatPlayMessage } from "@/lib/play-parser";
import { inSentence } from "@/lib/text";
import type { Person } from "@/lib/queries";

export type PlayerOption = Person & { discordId: string | null };

/** A logged play being corrected, and where it came from (which decides what happens in Discord). */
export type EditingPlay = {
  playId: number;
  gameId: number | null;
  playedOn: string;
  location: string | null;
  notes: string | null;
  playerIds: number[];
  night: Night;
  discord: "app-post" | "hand-post" | "none";
};

export function LogPlayForm({
  games,
  players,
  canPost,
  nightNames,
  editing,
  onDone,
}: {
  games: { id: number; name: string }[];
  players: PlayerOption[];
  /** One entry for each kind of night the group has: whether the app can post to its channel */
  canPost: Partial<Record<Night, boolean>>;
  /** What each night is called, from the server's config */
  nightNames: Record<Night, string>;
  editing?: EditingPlay;
  onDone?: () => void;
}) {
  const [seated, setSeated] = useState<Set<number>>(() => new Set(editing?.playerIds));
  const [guests, setGuests] = useState<Guest[]>([]);
  const [draft, setDraft] = useState(() =>
    editing
      ? { ...emptyDraft(), games: [{ gameId: editing.gameId ? String(editing.gameId) : "", bggLink: "" }], playedOn: editing.playedOn, location: editing.location ?? "", notes: editing.notes ?? "" }
      : emptyDraft(),
  );
  const setGame = (i: number, patch: Partial<GameRow>) =>
    setDraft((d) => ({ ...d, games: d.games.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const [night, setNight] = useState<Night>(editing?.night ?? "core");
  // A play from a night the group no longer has (the casual night turned off) can still be edited
  const nights = [...new Set([...(Object.keys(canPost) as Night[]), night])];
  // A play already in Discord belongs to the channel it's in
  const nightFixed = editing !== undefined && editing.discord !== "none";
  const [post, setPost] = useState(true);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    if (editing) {
      const res = await updatePlay(editing.playId, form);
      if (res.ok) onDone?.();
      return res;
    }
    const res = await logPlay(prev, form);
    // A game forgotten from the night can still be added: keep the date, place and people
    if (res.ok) {
      setDraft((d) => ({ ...emptyDraft(), playedOn: d.playedOn, location: d.location }));
      // Someone new is a player now: seat them as one, so the next game doesn't make them again
      if (res.playerIds?.length) {
        setSeated((s) => new Set([...s, ...res.playerIds!]));
        setGuests((gs) => gs.filter((g) => !g.isNew));
      }
    }
    return res;
  }, null);

  const chosen = useMemo(
    () =>
      draft.games.map((row) => {
        const id = row.gameId ? Number(row.gameId) : linkedBggId(row.bggLink);
        return id ? { id, name: games.find((g) => g.id === id)?.name ?? "(game from BGG link)" } : null;
      }),
    [draft.games, games],
  );

  const preview = useMemo(() => {
    const picked = chosen.filter((g) => g !== null);
    if (picked.length === 0 || seated.size + guests.length === 0) return null;
    const text = formatPlayMessage({
      games: picked.map((g) => ({ gameName: g.name, bggId: g.id })),
      playedOn: draft.playedOn,
      location: draft.location,
      notes: draft.notes,
      players: [
        ...players.filter((p) => seated.has(p.id)).map((p) => ({ name: p.name, discordId: p.discordId })),
        ...guests.map(({ name }) => ({ name })),
      ],
    });
    // Show mentions the way Discord renders them
    return text.replace(/<@(\d+)>/g, (_, id) => `@${players.find((p) => p.discordId === id)?.name ?? id}`);
  }, [chosen, players, draft, seated, guests]);

  // 16px on phones: iOS zooms the page into any smaller field it focuses
  const field = "rounded-lg border border-line bg-table px-3 py-2 text-base sm:text-sm";

  return (
    <form
      // Submitted by hand: a form `action` makes React reset the fields afterward, which would
      // wipe the controlled inputs we deliberately keep for the next game of the night
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(form));
      }}
      // One column on phones that's no wider than the form: a game list's longest name would widen it
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <fieldset className="grid min-w-0 grid-cols-1 content-start gap-2 text-sm">
        <legend className="mb-1">{draft.games.length > 1 ? "Games" : "Game"}</legend>
        {draft.games.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-1">
            <div className="flex gap-1.5">
              <select
                aria-label={`Game ${i + 1}`}
                value={row.gameId}
                onChange={(e) => setGame(i, { gameId: e.target.value })}
                className={clsx(field, "min-w-0 flex-1")}
              >
                <option value="">Choose…</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {draft.games.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove game ${i + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, games: d.games.filter((_, j) => j !== i) }))}
                  className={buttonClass("ghost", "px-2")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {!row.gameId && (
              <input
                value={row.bggLink}
                onChange={(e) => setGame(i, { bggLink: e.target.value })}
                placeholder="Not listed? Paste its BGG link"
                aria-label={`BGG link for game ${i + 1}`}
                className={field}
              />
            )}
            {chosen[i] && <input type="hidden" name="game" value={chosen[i].id} />}
          </div>
        ))}
        {!editing && draft.games.length < 10 && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, games: [...d.games, { gameId: "", bggLink: "" }] }))}
            className="justify-self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            + Another game that day
          </button>
        )}
      </fieldset>
      {nights.length > 1 ? (
        <fieldset className="grid content-start gap-1 text-sm sm:col-span-2">
          <legend className="mb-1">Which kind of event?</legend>
          <div className="flex w-fit gap-1 rounded-lg border border-line bg-table p-1">
            {nights.map((value) => (
              <label
                key={value}
                className={clsx(
                  "rounded-md px-3 py-1.5 font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                  night === value ? "bg-card text-ink shadow-token" : "text-slate",
                  nightFixed ? "cursor-not-allowed" : "cursor-pointer hover:text-ink",
                )}
              >
                <input type="radio" name="night" value={value} checked={night === value} disabled={nightFixed} onChange={() => setNight(value)} className="sr-only" />
                {nightNames[value]}
              </label>
            ))}
          </div>
          {nightFixed && <p className="text-xs text-slate">It stays with the channel its Discord post is in.</p>}
        </fieldset>
      ) : (
        // One kind of night: nothing to choose, but an edited play keeps the night it has
        <input type="hidden" name="night" value={night} />
      )}

      <label className="grid content-start gap-1 text-sm">
        Date
        <DateInput name="playedOn" required value={draft.playedOn} onChange={(e) => setDraft({ ...draft, playedOn: e.target.value })} className={field} />
      </label>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm">Who played?</legend>
        <WhoPlayed players={players} seated={seated} onSeated={setSeated} guests={guests} onGuests={setGuests} />
        {[...seated].map((id) => <input key={id} type="hidden" name="players" value={id} />)}
        {guests.map(({ name, isNew }) => <input key={name} type="hidden" name={isNew ? "newGuests" : "guests"} value={name} />)}
      </fieldset>

      <label className="grid gap-1 text-sm">
        Where
        <input name="location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Optional" className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        Notes
        <input name="notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" className={field} />
      </label>

      {editing && editing.discord !== "none" && (
        <p className="text-sm text-slate sm:col-span-2">
          {editing.discord === "app-post"
            ? canPost[editing.night]
              ? "Its Discord post will be updated to match."
              : "Its Discord post won't change: posting to Discord isn't set up here."
            : "This came from someone's message in Discord. The bot can't edit other people's messages, so that post stays as it was."}
        </p>
      )}

      {canPost[night] && !editing && (
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="postToDiscord" checked={post} onChange={(e) => setPost(e.target.checked)} className="size-4 accent-[var(--felt)]" />
            {nights.length > 1 ? `Post it to the ${inSentence(nightNames[night])}'s Discord channel` : "Post it to the Discord plays channel"}
          </label>
          {post && preview && <DiscordPreview text={preview} />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className={buttonClass("primary")} disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Log play"}</button>
        {editing && (
          <button type="button" onClick={onDone} className={buttonClass("ghost")}>
            Cancel
          </button>
        )}
        {state && <span role="status" className={state.ok ? "text-sm text-slate" : "text-sm text-meeple-red"}>{state.ok ? state.message : state.error}</span>}
        {state && !state.ok && state.duplicate && !editing && (
          <button name="allowDuplicate" value="1" className={buttonClass("secondary")} disabled={pending}>
            We played it again, log it
          </button>
        )}
      </div>
      {state?.ok && !editing && <p className="-mt-2 text-xs text-slate sm:col-span-2">Forgot one? The date, place and players are kept for it.</p>}
    </form>
  );
}

/** Someone typed in: matched by name, or `isNew` when they're someone new with a listed player's name */
export type Guest = { name: string; isNew: boolean };

const toggle = (set: Set<number>, id: number) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** Who played: a chip per player to tap, and a name to type for someone who isn't listed */
export function WhoPlayed({
  players,
  seated,
  onSeated,
  guests,
  onGuests,
}: {
  players: PlayerOption[];
  seated: Set<number>;
  onSeated: (seated: Set<number>) => void;
  guests: Guest[];
  onGuests: (guests: Guest[]) => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [sameName, setSameName] = useState<PlayerOption[]>([]);

  /** Add the name typed in. One a listed player has asks first whether it's them. */
  const addGuest = (isNew = false) => {
    const name = guestName.trim().replace(/\s+/g, " ");
    const listed = players.filter((p) => p.name.toLowerCase() === name.toLowerCase());
    if (name && listed.length && !isNew) return setSameName(listed);
    if (name && !guests.some((g) => g.name.toLowerCase() === name.toLowerCase())) onGuests([...guests, { name, isNew }]);
    setGuestName("");
    setSameName([]);
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const isSeated = seated.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSeated}
              onClick={() => onSeated(toggle(seated, p.id))}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border py-1 pr-3 pl-1.5 text-sm",
                isSeated ? "border-ink/70 bg-felt-soft font-medium" : "border-line text-slate",
              )}
            >
              <Meeple color={p.color} />
              {p.label}
            </button>
          );
        })}
        {guests.map(({ name }) => (
          <button
            key={name}
            type="button"
            aria-pressed
            aria-label={`Remove ${name}`}
            onClick={() => onGuests(guests.filter((g) => g.name !== name))}
            className="inline-flex items-center gap-1 rounded-full border border-ink/70 bg-felt-soft py-1 pr-3 pl-1.5 text-sm font-medium"
          >
            <Meeple color={null} />
            {name}
          </button>
        ))}
        <span className="inline-flex items-center">
          <input
            value={guestName}
            onChange={(e) => {
              setGuestName(e.target.value);
              setSameName([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGuest();
              }
            }}
            onBlur={() => addGuest()}
            placeholder="+ Someone new"
            aria-label="Add someone who isn't listed"
            className="w-36 rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-base placeholder:text-slate sm:text-sm"
          />
        </span>
      </div>
      {sameName.length > 0 && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-felt-soft/50 px-3 py-2 text-sm">
          <span>{sameName.length === 1 ? `${sameName[0].name} is on the list already.` : `${sameName.length} players are called ${sameName[0].name}.`} Is it</span>
          {sameName.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSeated(new Set([...seated, p.id]));
                setGuestName("");
                setSameName([]);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-1 pr-3 pl-1.5 font-medium"
            >
              <Meeple color={p.color} />
              {p.label}
            </button>
          ))}
          <span>or</span>
          <button type="button" onClick={() => addGuest(true)} className="rounded-full border border-dashed border-line bg-card px-3 py-1 font-medium">
            someone new
          </button>
        </div>
      )}
    </>
  );
}

/** Renders the bits of Discord markdown the template uses: **bold**, [links](…) and @mentions. */
function DiscordPreview({ text }: { text: string }) {
  return (
    <div aria-label="Discord message preview" className="rounded-lg border border-line bg-table px-3 py-2 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => (
        <div key={i}>
          {line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|@[\w’' ]+?(?=,|$))/).map((part, j) => {
            if (part.startsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
            const link = /^\[([^\]]+)\]/.exec(part);
            if (link) return <span key={j} className="text-[#2f6fb3] underline underline-offset-2">{link[1]}</span>;
            if (part.startsWith("@")) return <span key={j} className="rounded bg-[#5865f2]/15 px-0.5 text-[#4752c4]">{part}</span>;
            return part;
          })}
        </div>
      ))}
    </div>
  );
}

type GameRow = { gameId: string; bggLink: string };

function emptyDraft() {
  return { games: [{ gameId: "", bggLink: "" }] as GameRow[], playedOn: new Date().toLocaleDateString("en-CA"), location: "", notes: "" };
}

/** A BGG game link (or just its id) → the id */
function linkedBggId(link: string) {
  const id = /boardgamegeek\.com\/\w+\/(\d+)/.exec(link)?.[1] ?? /^\s*(\d+)\s*$/.exec(link)?.[1];
  return id ? Number(id) : null;
}
