"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import type { MeepleColor, RsvpStatus } from "@/db/enums";
import type { Attendee } from "@/lib/rsvp";
import { MAX_GUESTS } from "@/lib/rsvp";
import { setOthersComing, setRsvp } from "@/app/actions";
import { PlayerChip, buttonClass } from "@/components/ui";

type Member = { id: string; name: string; color: MeepleColor | null; playerName: string | null };
type Player = { id: number; name: string; label?: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-semibold">{label}</span>
      {children}
    </div>
  );
}

/** The picker's value for naming someone who isn't a player yet */
const NEW = -1;

const ANSWERS: { status: RsvpStatus; label: string }[] = [
  { status: "going", label: "Going" },
  { status: "maybe", label: "Maybe" },
  { status: "declined", label: "Can't make it" },
];

/** Who's coming: my answer and who I'm bringing, everyone's answers, and others counted by hand. Answered here or in Discord. */
export function People(props: {
  nightId: number;
  going: Attendee[];
  maybe: Attendee[];
  declined: Attendee[];
  guests: number;
  othersComing: number;
  capacity: number | null;
  members: Member[];
  players: Player[];
  myPlayerId: number | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const colors = Object.fromEntries(props.members.map((m) => [m.id, m.color]));
  const all = [...props.going, ...props.maybe, ...props.declined];
  const mine = all.find((a) => a.playerId === props.myPlayerId);
  const myStatus: RsvpStatus | null = !mine ? null : props.going.includes(mine) ? "going" : props.maybe.includes(mine) ? "maybe" : "declined";
  const count = props.going.length + props.guests;

  const answer = (status: RsvpStatus | null, opts?: { guests?: number; playerId?: number; name?: string; isNew?: boolean }) =>
    start(async () => {
      const res = await setRsvp(props.nightId, status, opts);
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-semibold">Are you coming?</span>
        {ANSWERS.map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={pending}
            aria-pressed={myStatus === a.status}
            onClick={() => answer(myStatus === a.status ? null : a.status)}
            className={buttonClass(myStatus === a.status ? "primary" : "secondary", "px-3 py-1.5 text-xs")}
          >
            {a.label}
          </button>
        ))}
        {mine && myStatus !== "declined" && (
          <Stepper
            label="Bringing"
            value={mine.guests ?? 0}
            max={MAX_GUESTS}
            disabled={pending}
            onChange={(guests) => answer(myStatus, { guests })}
          />
        )}
      </div>
      {error && <p className="text-meeple-red">{error}</p>}

      <div className="space-y-2">
        <Row label={`Going (${count}${props.capacity ? `/${props.capacity}` : ""})`}>
          {props.going.length ? props.going.map((a) => <Answered key={a.playerId} a={a} colors={colors} />) : <span className="text-slate">Nobody yet</span>}
        </Row>
        {props.maybe.length > 0 && (
          <Row label="Maybe">
            {props.maybe.map((a) => (
              <Answered key={a.playerId} a={a} colors={colors} faded />
            ))}
          </Row>
        )}
        {props.declined.length > 0 && (
          <Row label="Can't make it">
            {props.declined.map((a) => (
              <Answered key={a.playerId} a={a} colors={colors} faded />
            ))}
          </Row>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-3">
        <Stepper label="Others coming, not named" value={props.othersComing} max={20} disabled={pending} onChange={(n) => start(async () => void (await setOthersComing(props.nightId, n)))} />
        <ForSomeoneElse players={props.players} myPlayerId={props.myPlayerId} disabled={pending} onAnswer={(who, status) => answer(status, who)} />
      </div>
    </div>
  );
}

function Answered({ a, colors, faded }: { a: Attendee; colors: Record<string, MeepleColor | null>; faded?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1", faded && "opacity-70")} title={a.userId ? undefined : "Not a member"}>
      <PlayerChip name={a.guests ? `${a.name} +${a.guests}` : a.name} color={a.userId ? (colors[a.userId] ?? null) : null} />
    </span>
  );
}

function Stepper({ label, value, max, disabled, onChange }: { label: string; value: number; max: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <button type="button" aria-label="One fewer" disabled={disabled || value === 0} onClick={() => onChange(value - 1)} className={buttonClass("secondary", "size-8 p-0")}>
        <Minus className="size-4" />
      </button>
      <span className="tabular w-5 text-center font-medium" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="One more" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={buttonClass("secondary", "size-8 p-0")}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** A picked player, or someone new by name (`isNew` when a listed player has that name too) */
type Who = { playerId: number } | { name: string; isNew: boolean };

/** Answer for someone who said so in chat, who can't use the buttons, or who isn't on Boardroom or in Discord yet */
function ForSomeoneElse({ players, myPlayerId, disabled, onAnswer }: { players: Player[]; myPlayerId: number | null; disabled: boolean; onAnswer: (who: Who, status: RsvpStatus | null) => void }) {
  const [playerId, setPlayerId] = useState(0);
  const [name, setName] = useState("");
  const isNew = playerId === NEW;
  // A name someone on the list has: say so, in case it's them
  const listed = isNew ? players.filter((p) => p.name.toLowerCase() === name.trim().replace(/\s+/g, " ").toLowerCase()) : [];
  const who: Who = isNew ? { name, isNew: listed.length > 0 } : { playerId };
  const answerFor = (status: RsvpStatus | null) => {
    onAnswer(who, status);
    if (isNew) {
      setPlayerId(0);
      setName("");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={playerId}
        onChange={(e) => setPlayerId(Number(e.target.value))}
        aria-label="Answer for someone else"
        className="rounded-md border border-line bg-table px-2 py-1"
      >
        <option value={0}>Answer for someone else…</option>
        <option value={NEW}>Someone new…</option>
        {players
          .filter((p) => p.id !== myPlayerId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.label ?? p.name}
            </option>
          ))}
      </select>
      {isNew && (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Their name"
          aria-label="Their name"
          className="w-36 rounded-md border border-line bg-table px-2 py-1"
        />
      )}
      {listed.length > 0 && (
        <span className="text-xs text-slate">
          {listed.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " or "}
              <button
                type="button"
                onClick={() => {
                  setPlayerId(p.id);
                  setName("");
                }}
                className="text-accent underline-offset-4 hover:underline"
              >
                {p.label ?? p.name}
              </button>
            </span>
          ))}{" "}
          is on the list already. Answering here adds someone new.
        </span>
      )}
      {(playerId > 0 || (isNew && name.trim())) && (
        <>
          {ANSWERS.map((a) => (
            <button key={a.status} type="button" disabled={disabled} onClick={() => answerFor(a.status)} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
              {a.label}
            </button>
          ))}
          {!isNew && (
            <button type="button" disabled={disabled} onClick={() => answerFor(null)} className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>
              No answer
            </button>
          )}
        </>
      )}
    </div>
  );
}
