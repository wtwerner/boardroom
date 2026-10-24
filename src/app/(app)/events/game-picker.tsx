"use client";

import Link from "next/link";
import { Fragment, useDeferredValue, useMemo, useState, useTransition } from "react";
import { Check, Minus, Plus, Search, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor, Night } from "@/db/enums";
import { type ActionResult, addGameToNight, askClaudeForNight, askToBring } from "@/app/actions";
import type { NightPicks } from "@/lib/ai";
import { type NightGame, type NightOpinion, scoreNight } from "@/lib/night";
import { GameCover, Meeple, Panel, buttonClass, playerRange, playtime } from "@/components/ui";
import { inSentence } from "@/lib/text";

type Member = { id: string; name: string; color: MeepleColor | null };
type Game = NightGame & { thumbnail: string | null };

const TIMES = [
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
  { label: "All evening", value: null },
] as const;

const WEIGHTS = [
  { label: "Light", min: null, max: 2.5 },
  { label: "Any", min: null, max: null },
  { label: "Medium and up", min: 2.5, max: null },
  { label: "Heavy", min: 3.5, max: null },
] as const;
type Weight = (typeof WEIGHTS)[number];

/**
 * Where each night starts: the core group preps for something meaty, while the casual night
 * has guests who haven't read any rules, so lighter games and a couple of extra seats.
 */
const START: Record<Night, { minutes: number | null; weight: Weight["label"]; others: number }> = {
  core: { minutes: 180, weight: "Medium and up", others: 0 },
  casual: { minutes: 120, weight: "Light", others: 2 },
};

export function GamePicker(props: {
  night: Night;
  /** What this kind of night is called, from the server's config */
  nightName: string;
  /** The night these picks are for */
  nightId: number;
  /** Games already on it, and what they are there: "Proposed", "Sam's bringing it" */
  onNight: Record<number, string>;
  /** Who's going: members by id, and how many others */
  going: { memberIds: string[]; others: number } | null;
  meId: string;
  members: Member[];
  games: Game[];
  opinions: NightOpinion[];
  rankings: Record<string, number[]>[];
  chances: Record<number, Record<string, number>>;
  today: string;
  aiEnabled: boolean;
}) {
  const start = START[props.night];
  const [present, setPresent] = useState<Set<string>>(() => new Set(props.going?.memberIds ?? props.members.map((m) => m.id)));
  const [others, setOthers] = useState(props.going?.others ?? start.others);
  const [minutes, setMinutes] = useState<number | null>(start.minutes);
  const [weight, setWeight] = useState<Weight>(() => WEIGHTS.find((w) => w.label === start.weight)!);
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [newOnly, setNewOnly] = useState(false);
  const [ai, setAi] = useState<NightPicks | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();

  const playerCount = present.size + others;
  const names = useMemo(() => Object.fromEntries(props.members.map((m) => [m.id, m.name])), [props.members]);
  const gameById = useMemo(() => new Map(props.games.map((g) => [g.id, g])), [props.games]);

  const scored = useMemo(
    () =>
      scoreNight({
        games: props.games,
        opinions: props.opinions,
        rankings: props.rankings,
        chances: props.chances,
        presentUserIds: [...present],
        names,
        playerCount,
        minutes,
        minWeight: weight.min,
        maxWeight: weight.max,
        ownedByPresentOnly: ownedOnly,
        newOnly,
        night: props.night,
        nightName: props.nightName,
        today: props.today,
      }),
    [props.games, props.opinions, props.rankings, props.chances, present, names, playerCount, minutes, weight, ownedOnly, newOnly, props.night, props.nightName, props.today],
  );

  const reset = () => {
    setAi(null);
    setAiError(null);
  };

  const toggle = (id: string) => {
    const next = new Set(present);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPresent(next);
    reset();
  };

  const askClaude = () =>
    startAsking(async () => {
      setAiError(null);
      const res = await askClaudeForNight({
        night: props.night,
        presentUserIds: [...present],
        others,
        minutes,
        candidateIds: scored.slice(0, 20).map((s) => s.game.id),
      });
      if (res.ok) setAi(res.picks);
      else setAiError(res.error);
    });

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Who&apos;s coming?</legend>
          <div className="flex flex-wrap gap-1.5">
            {props.members.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={present.has(m.id)}
                onClick={() => toggle(m.id)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-2 text-sm",
                  present.has(m.id) ? "border-ink/70 bg-felt-soft font-medium" : "border-line text-slate line-through decoration-slate/60",
                )}
              >
                <Meeple color={m.color} />
                {m.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="flex-1">Others coming</span>
            <button
              type="button"
              aria-label="One fewer"
              disabled={others === 0}
              onClick={() => { setOthers(others - 1); reset(); }}
              className={buttonClass("secondary", "size-8 p-0")}
            >
              <Minus className="size-4" />
            </button>
            <span className="tabular w-5 text-center font-medium" aria-live="polite">{others}</span>
            <button
              type="button"
              aria-label="One more"
              disabled={others >= 10}
              onClick={() => { setOthers(others + 1); reset(); }}
              className={buttonClass("secondary", "size-8 p-0")}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-slate">
            {playerCount} {playerCount === 1 ? "player" : "players"} at the table{props.going && ", starting from who's going"}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">How meaty?</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEIGHTS.map((w) => (
              <button
                key={w.label}
                type="button"
                aria-pressed={weight === w}
                onClick={() => { setWeight(w); reset(); }}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-sm",
                  weight === w ? "border-ink/80 bg-felt text-felt-ink shadow-token" : "border-line bg-card",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">How long have we got?</legend>
          <div className="flex flex-wrap gap-1.5">
            {TIMES.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={minutes === t.value}
                onClick={() => { setMinutes(t.value); reset(); }}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-sm",
                  minutes === t.value ? "border-ink/80 bg-felt text-felt-ink shadow-token" : "border-line bg-card",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ownedOnly} onChange={(e) => { setOwnedOnly(e.target.checked); reset(); }} className="mt-0.5 size-4 accent-[var(--felt)]" />
          Only games someone coming owns
        </label>
        <label className="-mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={newOnly} onChange={(e) => { setNewOnly(e.target.checked); reset(); }} className="mt-0.5 size-4 accent-[var(--felt)]" />
          Only games nobody coming has played with the group
        </label>

        {props.aiEnabled && (
          <button type="button" onClick={askClaude} disabled={asking || scored.length === 0} className={buttonClass("primary", "w-full")}>
            <Sparkles className="size-4" />
            {asking ? "Thinking…" : "Ask Claude to pick"}
          </button>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        {aiError && <p role="alert" className="rounded-lg border border-meeple-red/40 px-3 py-2 text-sm text-meeple-red">{aiError}</p>}
        {ai && (
          <Panel className="border-felt/40 bg-felt-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 font-wide"><Sparkles className="size-4 text-accent" /> Claude&apos;s picks</h2>
            <ol className="space-y-3">
              {ai.picks.map((p) => {
                const g = gameById.get(p.gameId);
                if (!g) return null;
                return (
                  <li key={p.gameId} className="flex gap-3">
                    <GameCover src={g.thumbnail} name={g.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/games/${g.id}`} className="font-semibold hover:underline">{g.name}</Link>
                      <p className="text-sm text-slate">{p.reason}</p>
                      {props.night === "casual" && (
                        <Copies nightId={props.nightId} gameId={g.id} owners={owners(g.ownerIds, names, present)} meId={props.meId} onList={Boolean(props.onNight[g.id])} className="mt-0.5" />
                      )}
                    </div>
                    <NightButton nightId={props.nightId} gameId={g.id} night={props.night} status={props.onNight[g.id]} owners={owners(g.ownerIds, names, present)} meId={props.meId} />
                  </li>
                );
              })}
            </ol>
            {ai.note && <p className="mt-3 text-sm">{ai.note}</p>}
          </Panel>
        )}

        {scored.length > 0 && (
          <p className="text-sm text-slate">
            Ordered by what the people coming have said (ratings, want to play, 🔥 must play, rankings), with their taste filling in
            games they haven&apos;t rated. Best at this player count helps; played in the last month, or a &ldquo;not for me&rdquo;,
            drops it. Legacy games are left out.
            {props.night === "casual" && ` Only ${inSentence(props.nightName)} plays count here, its regulars get a nudge, and a game nobody coming has played drops, since someone has to teach it.`}{" "}
            <Link href="/about#plan" className="font-medium text-accent underline-offset-4 hover:underline">
              The points
            </Link>
          </p>
        )}
        {scored.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-slate">
            Nothing fits {playerCount} players{minutes ? ` in under ${minutes / 60} hours` : ""}
            {weight.min ? ` at weight ${weight.min}+` : weight.max ? ` up to weight ${weight.max}` : ""}
            {newOnly ? " that nobody coming has played" : ""}. Try more time, another weight
            {ownedOnly ? ", or games nobody coming owns" : ""}.
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Best fits">
            {scored.slice(0, 12).map(({ game, reasons }, i) => {
              const g = gameById.get(game.id)!;
              return (
                <li key={game.id} className={clsx("flex items-start gap-2 rounded-xl border bg-card p-3 pr-2 has-[a:hover]:border-ink/40", i === 0 ? "border-ink/60" : "border-line")}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {/* The name is the link for keyboards and screen readers; the cover is a bigger target */}
                    <Link href={`/games/${game.id}`} tabIndex={-1} aria-hidden className="shrink-0">
                      <GameCover src={g.thumbnail} name={g.name} size={i === 0 ? "md" : "sm"} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Link href={`/games/${game.id}`} className={clsx("font-semibold hover:underline", i === 0 && "font-display text-xl")}>{g.name}</Link>
                        <span className="text-xs text-slate">
                          {[playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.weight ? `weight ${g.weight.toFixed(1)}` : null].filter(Boolean).join(", ")}
                        </span>
                      </div>
                      {props.night === "casual" && (
                        <Copies nightId={props.nightId} gameId={game.id} owners={owners(g.ownerIds, names, present)} meId={props.meId} onList={Boolean(props.onNight[game.id])} className="mt-0.5" />
                      )}
                      {reasons.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {reasons.map((r) => (
                            <li
                              key={r.text}
                              className={clsx(
                                "rounded-full px-2 py-0.5 text-xs",
                                r.tone === "good" && "bg-meeple-green/15 text-ink",
                                r.tone === "bad" && "bg-meeple-red/12 text-ink",
                                r.tone === "neutral" && "bg-line/60 text-ink",
                              )}
                            >
                              {r.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <NightButton nightId={props.nightId} gameId={game.id} night={props.night} status={props.onNight[game.id]} owners={owners(g.ownerIds, names, present)} meId={props.meId} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

type ShelfGame = Pick<Game, "id" | "name" | "thumbnail" | "minPlayers" | "maxPlayers" | "minPlaytime" | "maxPlaytime" | "ownerIds">;

/**
 * Any game on the shelf, by name: for the one you want to bring or propose that the
 * recommendations didn't list (filtered out, or just further down).
 */
export function GameSearch(props: { night: Night; nightId: number; onNight: Record<number, string>; games: ShelfGame[]; members: Member[]; comingIds: string[]; meId: string }) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const names = useMemo(() => Object.fromEntries(props.members.map((m) => [m.id, m.name])), [props.members]);
  const coming = useMemo(() => new Set(props.comingIds), [props.comingIds]);
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    // Names that start with the search first, then ones that contain it
    return props.games
      .filter((g) => g.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [props.games, q]);

  return (
    <div className="space-y-2">
      <label className="relative block max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${props.night === "core" ? "Propose" : "Bring"} something else: search ${props.games.length} games`}
          aria-label={props.night === "core" ? "Search the shelf for a game to propose" : "Search the shelf for a game to bring"}
          className="w-full rounded-lg border border-line bg-card py-2 pr-3 pl-9 text-sm"
        />
      </label>
      {q.length >= 2 &&
        (matches.length ? (
          <ul className="space-y-2" aria-label="Shelf matches">
            {matches.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 pr-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Link href={`/games/${g.id}`} tabIndex={-1} aria-hidden className="shrink-0">
                    <GameCover src={g.thumbnail} name={g.name} size="sm" />
                  </Link>
                  <span className="min-w-0">
                    <Link href={`/games/${g.id}`} className="block font-semibold hover:underline">{g.name}</Link>
                    <span className="block text-xs text-slate">{[playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime)].filter(Boolean).join(", ")}</span>
                    {props.night === "casual" && (
                      <Copies nightId={props.nightId} gameId={g.id} owners={owners(g.ownerIds, names, coming)} meId={props.meId} onList={Boolean(props.onNight[g.id])} />
                    )}
                  </span>
                </div>
                <NightButton nightId={props.nightId} gameId={g.id} night={props.night} status={props.onNight[g.id]} owners={owners(g.ownerIds, names, coming)} meId={props.meId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">Nothing on the shelf called that.</p>
        ))}
    </div>
  );
}

export type Owner = { id: string; name: string; coming: boolean };

/** Who has a copy, named, and whether they're coming */
function owners(ownerIds: string[], names: Record<string, string>, coming: Set<string>): Owner[] {
  return ownerIds.filter((id) => names[id]).map((id) => ({ id, name: names[id], coming: coming.has(id) }));
}

function NightButton(props: { nightId: number; gameId: number; night: Night; status: string | undefined; owners: Owner[]; meId: string }) {
  if (props.status) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs font-semibold text-accent">
        <Check className="size-3.5" strokeWidth={3} /> {props.status}
      </span>
    );
  }
  return props.night === "core" ? <ProposeButton nightId={props.nightId} gameId={props.gameId} /> : <BringButton {...props} />;
}

function ProposeButton({ nightId, gameId }: { nightId: number; gameId: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addGameToNight(nightId, gameId);
            setError(res.ok ? null : res.error);
          })
        }
        className={buttonClass("secondary", "shrink-0 px-2.5 py-1.5 text-xs")}
      >
        {pending ? "Adding…" : "Propose"}
      </button>
      {error && <span className="mt-1 max-w-32 text-right text-xs text-meeple-red">{error}</span>}
    </span>
  );
}

/**
 * "I'll bring it", for a game I own. Anyone else asks an owner in the copy line (Copies), so
 * a row has one button at most.
 */
export function BringButton({ nightId, gameId, owners, meId }: { nightId: number; gameId: number; owners: Owner[]; meId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!owners.some((o) => o.id === meId)) return null;
  return (
    <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addGameToNight(nightId, gameId);
            setError(res.ok ? null : res.error);
          })
        }
        className={buttonClass("secondary", "shrink-0 px-2.5 py-1.5 text-xs")}
      >
        {pending ? "Adding…" : "I'll bring it"}
      </button>
      {error && <span className="max-w-32 text-right text-xs text-meeple-red">{error}</span>}
    </span>
  );
}

/**
 * Whose copies there are, on a casual night. For a game I don't own that isn't on the list yet,
 * it's where I ask an owner to bring theirs: each name is a tap, and they get a DM. People coming
 * come first.
 */
export function Copies(props: { nightId: number; gameId: number; owners: Owner[]; meId: string; onList: boolean; className?: string }) {
  const { nightId, gameId, meId } = props;
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const owners = [...props.owners].sort((a, b) => Number(b.coming) - Number(a.coming) || a.name.localeCompare(b.name));
  const others = owners.filter((o) => o.id !== meId);
  const className = clsx("text-xs text-slate", props.className);

  // How the ask went ("Asked Sam. They've got a DM to answer."), once it's gone
  if (result?.ok && result.message) return <p className={className}>{result.message}</p>;
  if (props.onList || owners.some((o) => o.id === meId) || others.length === 0) return <p className={className}>{whose(owners, meId)}</p>;
  if (pending && asking) return <p className={className}>Asking {asking}…</p>;
  return (
    <p className={className}>
      Ask{" "}
      {others.map((o, i) => (
        <Fragment key={o.id}>
          {i > 0 && (i === others.length - 1 ? " or " : ", ")}
          <button
            type="button"
            onClick={() => {
              setAsking(o.name);
              start(async () => setResult(await askToBring(nightId, gameId, o.id)));
            }}
            className="font-medium text-accent underline underline-offset-2 hover:text-ink"
          >
            {o.name}
          </button>
          {!o.coming && " (not coming)"}
        </Fragment>
      ))}{" "}
      to bring theirs
      {result && !result.ok && <span className="text-meeple-red"> · {result.error}</span>}
    </p>
  );
}

/** "Your copy or Sam's", "Sam's or Alex's copy": the copies coming along, or else everyone's */
function whose(owners: Owner[], meId: string) {
  const coming = owners.filter((o) => o.coming);
  const pool = coming.length ? coming : owners;
  if (pool.length === 0) return "Nobody in the group owns it";
  const theirs = pool.filter((o) => o.id !== meId).map((o) => `${o.name}'s`);
  const text = pool.some((o) => o.id === meId) ? `Your copy${theirs.length ? ` or ${orList(theirs)}` : ""}` : `${orList(theirs)} copy`;
  return coming.length ? text : `${text} (not coming)`;
}

/** "A", "A or B", "A, B or C" */
const orList = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`);
