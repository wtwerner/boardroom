"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { MEEPLE_COLORS, type MeepleColor } from "@/db/enums";
import { type ActionResult, importCsv, mergePlayers, playerNightsFor, renamePlayer, saveBgaProfile, saveBggUsername, setMyColor, setPlayerDiscord, splitPlayer } from "@/app/actions";
import { authClient } from "@/lib/auth-client";
import { Meeple, buttonClass, formatDate } from "@/components/ui";
import type { SeatNight } from "@/lib/queries";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p role="status" className={clsx("text-sm", state.ok ? "text-slate" : "text-meeple-red")}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

const input = "rounded-lg border border-line bg-table px-3 py-2 text-sm";

export function ColorPicker({ current, taken }: { current: MeepleColor | null; taken: MeepleColor[] }) {
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Meeple color" className="flex flex-wrap gap-2">
      {MEEPLE_COLORS.map((c) => {
        const isTaken = taken.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={current === c}
            aria-label={`${c}${isTaken ? " (taken)" : ""}`}
            disabled={pending || isTaken}
            onClick={() => start(() => setMyColor(c))}
            className={clsx(
              "grid size-12 place-items-center rounded-xl border-2 bg-card disabled:opacity-30",
              current === c ? "border-ink shadow-token" : "border-line hover:border-ink/40",
            )}
          >
            <Meeple color={c} className="size-7" />
          </button>
        );
      })}
    </div>
  );
}

export function BggForm({ username }: { username: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveBggUsername, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="bggUsername">Your BGG username</label>
      <div className="flex gap-2">
        <input id="bggUsername" name="bggUsername" defaultValue={username ?? ""} autoComplete="off" className={clsx(input, "flex-1")} />
        <button className={buttonClass("primary")} disabled={pending}>{pending ? "Syncing…" : "Save and sync"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function BgaForm({ username, premium }: { username: string | null; premium: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveBgaProfile, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="bgaUsername">Your BGA name</label>
      <div className="flex flex-wrap gap-2">
        <input id="bgaUsername" name="bgaUsername" defaultValue={username ?? ""} autoComplete="off" maxLength={40} className={clsx(input, "min-w-40 flex-1")} />
        <button className={buttonClass("secondary")} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="bgaPremium" defaultChecked={premium} className="size-4 accent-[var(--felt)]" />
        I have BGA Premium
      </label>
      <Result state={state} />
    </form>
  );
}

export function CsvForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(importCsv, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input type="file" name="csv" accept=".csv,text/csv" aria-label="BGG collection CSV" className="flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-card file:px-3 file:py-1.5 file:text-sm" />
        <button className={buttonClass("secondary")} disabled={pending}>{pending ? "Importing…" : "Import"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function PlayerDiscordLink({
  playerId,
  discordId,
  isMember,
  members,
}: {
  playerId: number;
  discordId: string | null;
  isMember: boolean;
  members: { id: string; name: string; username: string }[];
}) {
  const [value, setValue] = useState(discordId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const known = members.find((m) => m.id === discordId);

  if (isMember) {
    return <span className="text-xs text-slate">{known ? `@${known.username}` : "Linked through sign-in"}</span>;
  }

  const save = (next: string) =>
    start(async () => {
      const res = await setPlayerDiscord(playerId, next || null);
      setError(res.ok ? null : res.error);
    });

  return (
    <span className="flex flex-col items-end gap-0.5">
      {members.length > 0 ? (
        <select
          aria-label="Discord account"
          value={value}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            save(e.target.value);
          }}
          className="max-w-52 rounded-lg border border-line bg-table px-2 py-1 text-xs"
        >
          <option value="">Not on Discord</option>
          {/* Keep an id from an old mention selectable even if they've left the server */}
          {discordId && !known && <option value={discordId}>Discord user {discordId}</option>}
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>
          ))}
        </select>
      ) : (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Discord user id"
            aria-label="Discord user id"
            inputMode="numeric"
            className="w-44 rounded-lg border border-line bg-table px-2 py-1 text-xs"
          />
          <button className={buttonClass("ghost", "px-2 py-1 text-xs")} disabled={pending || value === (discordId ?? "")}>
            Save
          </button>
        </form>
      )}
      {error && <span className="text-xs text-meeple-red">{error}</span>}
    </span>
  );
}

export function MergePlayersForm({ players, myPlayerId }: { players: { id: number; name: string; isMember: boolean }[]; myPlayerId: number | null }) {
  const [from, setFrom] = useState("");
  const [into, setInto] = useState(myPlayerId ? String(myPlayerId) : "");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await mergePlayers(Number(from), Number(into));
          setState(res);
          if (res.ok) setFrom("");
        });
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Player to merge" value={from} onChange={(e) => setFrom(e.target.value)} required className={input}>
          <option value="">Choose a name…</option>
          {players.filter((p) => !p.isMember).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span>is the same person as</span>
        <select aria-label="Merge into" value={into} onChange={(e) => setInto(e.target.value)} required className={input}>
          <option value="">Choose…</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.id === myPlayerId ? `${p.name} (me)` : p.name}</option>)}
        </select>
        <button className={buttonClass("secondary")} disabled={pending || !from || !into}>{pending ? "Merging…" : "Merge"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Pick a player, tick the nights that were someone else with their name, and name that someone */
export function SplitPlayerForm({ players }: { players: { id: number; name: string; label: string }[] }) {
  const [id, setId] = useState("");
  const [nights, setNights] = useState<SeatNight[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const choose = (value: string) => {
    setId(value);
    setNights(null);
    setPicked(new Set());
    setState(null);
    setName(players.find((p) => String(p.id) === value)?.name ?? "");
    if (value) start(async () => setNights(await playerNightsFor(Number(value))));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await splitPlayer(Number(id), [...picked], name);
          setState(res);
          if (res.ok) {
            setPicked(new Set());
            setNights(await playerNightsFor(Number(id)));
          }
        });
      }}
      className="space-y-3"
    >
      <select aria-label="Player whose nights to split" value={id} onChange={(e) => choose(e.target.value)} className={clsx(input, "text-sm")}>
        <option value="">Choose a name…</option>
        {players.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {nights && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm">Which nights were someone else?</legend>
          <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-card">
            {nights.map((n) => (
              <label key={n.key} className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-felt-soft/40">
                <input
                  type="checkbox"
                  checked={picked.has(n.key)}
                  onChange={() => setPicked((s) => (s.has(n.key) ? new Set([...s].filter((k) => k !== n.key)) : new Set([...s, n.key])))}
                  className="mt-0.5 size-4 accent-[var(--felt)]"
                />
                <span className="min-w-0">
                  <span className="font-medium">{formatDate(n.playedOn)}</span>
                  {n.location && <span className="text-slate"> · {n.location}</span>}
                  <span className="block text-slate">{n.games.join(", ")}</span>
                  {n.with.length > 0 && <span className="block text-xs text-slate">With {n.with.join(", ")}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {nights && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="split-name">They&apos;re called</label>
          <input id="split-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={clsx(input, "w-40")} />
          <button className={buttonClass("secondary")} disabled={pending || picked.size === 0 || !name.trim()}>{pending ? "Saving…" : "Split them off"}</button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}

export function RenamePlayerForm({
  players,
  myPlayerId,
  label,
}: {
  /** `label` tells apart players who share a name */
  players: { id: number; name: string; label?: string }[];
  myPlayerId: number | null;
  /** When set, the form only renames `players[0]` and shows this label instead of a picker */
  label?: string;
}) {
  const [id, setId] = useState(label ? String(players[0]?.id ?? "") : "");
  const [name, setName] = useState(label ? (players[0]?.name ?? "") : "");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await renamePlayer(Number(id), name)));
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {label ? (
          <label htmlFor={`rename-${id}`} className="sr-only">{label}</label>
        ) : (
          <>
            <select
              aria-label="Player to rename"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setName(players.find((p) => String(p.id) === e.target.value)?.name ?? "");
              }}
              required
              className={input}
            >
              <option value="">Choose a name…</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.id === myPlayerId ? `${p.name} (me)` : (p.label ?? p.name)}</option>)}
            </select>
            <span>should be called</span>
          </>
        )}
        <input
          id={`rename-${id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
          aria-label={label ? undefined : "New name"}
          className={clsx(input, label ? "flex-1" : "w-40")}
        />
        <button className={buttonClass("secondary")} disabled={pending || !id || !name.trim()}>{pending ? "Saving…" : label ? "Save" : "Rename"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={buttonClass("ghost", "-ml-3")}
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
