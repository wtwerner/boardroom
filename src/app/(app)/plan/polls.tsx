"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ExternalLink, Undo2 } from "lucide-react";
import clsx from "clsx";
import { type DateAnswer, type MeepleColor, type Night, POLL_MAX_DATES } from "@/db/enums";
import { answerDate, callOffPoll, noDatesWork, reopenPoll, setNightDate, startPoll, suggestPollDate } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { PlayerChip, buttonClass } from "@/components/ui";
import { discordAppUrl } from "@/lib/discord-components";
import { rankDates } from "@/lib/date-answers";
import { titleCase } from "@/lib/text";
import type { NightSetup } from "../events/night-form";
import { DateRows, readDates } from "./date-rows";

type Voter = { playerId: number; name: string; userId: string | null };

/** A night finding its date, as Plan and its page show it, with its dates already written out in the group's time zone */
export type PollView = {
  id: number;
  nightId: number;
  title: string;
  /** What its kind of night is called, when the group has more than one kind */
  kindName: string | null;
  location: string | null;
  /** Its post in Discord */
  url: string | null;
  /** Called off, or every date went by without one being set */
  status: "open" | "cancelled" | "closed";
  /** The time its dates start at, for suggesting another */
  usualTime: string;
  dates: {
    id: number;
    startsAt: string;
    /** "Thu, Nov 5" and "7:00 PM" */
    label: string;
    time: string;
    /** "Tonight", "Tomorrow" and so on, when it's close */
    soon: string | null;
    past: boolean;
    fellThrough: boolean;
    yes: Voter[];
    maybe: Voter[];
    /** Can't: said, or `assumed` once they'd answered another date and left this one */
    no: (Voter & { assumed: boolean })[];
  }[];
};

type DateView = PollView["dates"][number];

const field = "w-full rounded-md border border-line bg-table px-2.5 py-1.5 text-sm";
const ANSWERS: { answer: DateAnswer; label: string }[] = [
  { answer: "yes", label: "Works" },
  { answer: "maybe", label: "If I have to" },
  { answer: "no", label: "Can't" },
];

/**
 * The dates a night might be on: each with who can come and your answer, then suggesting
 * another, setting one (everyone's down as they answered), saying none work, or calling it off.
 * The same as the buttons on its post in Discord. `link` titles it with a link to the night's
 * page, for Plan.
 */
export function PollCard({ poll, myPlayerId, colors, link = false }: { poll: PollView; myPlayerId: number | null; colors: Record<string, MeepleColor | null>; link?: boolean }) {
  const [open, setOpen] = useState<"suggest" | "set" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? null));
      if (res.ok) after?.();
    });
  const onOffer = poll.dates.filter((d) => !d.past && !d.fellThrough);
  const done = poll.dates.filter((d) => d.past || d.fellThrough);
  const answered = myPlayerId !== null && onOffer.some((d) => [...d.yes, ...d.maybe, ...d.no].some((v) => v.playerId === myPlayerId && !("assumed" in v && v.assumed)));

  return (
    <article id={`poll-${poll.id}`} className="scroll-mt-20 space-y-3 rounded-xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight">
            {link ? (
              <Link href={`/events/${poll.nightId}`} className="underline-offset-4 hover:underline">
                {poll.title}
              </Link>
            ) : (
              "Which date?"
            )}
          </h3>
          {/* On the night's page, its header says the rest */}
          {link && <p className="text-sm text-slate">{["Date TBD", poll.kindName, poll.location].filter(Boolean).join(" · ")}</p>}
        </div>
        {poll.url && (
          <a href={discordAppUrl(poll.url) ?? poll.url} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
            <ExternalLink className="size-3.5" /> Open in Discord
          </a>
        )}
      </header>

      {poll.status === "open" && !answered && <p className="text-sm text-slate">Say which dates work. Any you leave count as can&apos;t.</p>}
      {poll.status === "closed" && <p className="text-sm text-slate">Every date&apos;s gone by. Suggest another, or call it off.</p>}

      <ul className="space-y-2">
        {onOffer.map((d) => (
          <DateRow key={d.id} date={d} myPlayerId={myPlayerId} colors={colors} canAnswer={poll.status === "open"} onError={setError} />
        ))}
      </ul>
      {done.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate">
          {done.map((d) => (
            <li key={d.id}>
              <span className="line-through">
                {d.label}, {d.time}
              </span>{" "}
              · {d.fellThrough ? `fell through${d.yes.length + d.maybe.length ? ` (${d.yes.length + d.maybe.length} could come)` : ""}` : "gone by"}
            </li>
          ))}
        </ul>
      )}

      {open === "suggest" && (
        <SuggestForm
          usualTime={poll.usualTime}
          pending={pending}
          onCancel={() => setOpen(null)}
          onSubmit={(input) => run(() => suggestPollDate(poll.id, input), () => setOpen(null))}
        />
      )}
      {open === "set" && <SetForm poll={poll} pending={pending} onCancel={() => setOpen(null)} onSubmit={(optionId) => run(() => setNightDate(poll.id, optionId), () => setOpen(null))} />}
      {error && <p role="alert" className="text-sm text-meeple-red">{error}</p>}

      {poll.status === "cancelled" && onOffer.length > 0 && (
        <button type="button" disabled={pending} onClick={() => run(() => reopenPoll(poll.id))} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
          <Undo2 className="size-3.5" /> {pending ? "Reopening…" : "Reopen"}
        </button>
      )}
      {!open && poll.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          {onOffer.length > 0 && poll.status === "open" && (
            <button type="button" onClick={() => setOpen("set")} className={buttonClass("primary", "px-2.5 py-1.5 text-xs")}>
              <Check className="size-3.5" strokeWidth={3} /> Set the date
            </button>
          )}
          {onOffer.length < POLL_MAX_DATES && (
            <button type="button" onClick={() => setOpen("suggest")} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
              <CalendarPlus className="size-3.5" /> Suggest a date
            </button>
          )}
          {onOffer.length > 0 && poll.status === "open" && myPlayerId !== null && (
            <button type="button" disabled={pending} onClick={() => run(() => noDatesWork(poll.id))} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
              None work for me
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Call off ${poll.title} without setting a date?`)) run(() => callOffPoll(poll.id));
            }}
            className={buttonClass("ghost", "px-2.5 py-1.5 text-xs")}
          >
            Call it off
          </button>
        </div>
      )}
    </article>
  );
}

/** A night called off while it was finding a date, with one still coming up, so it can be reopened with its answers */
export function CalledOffPoll({ id, nightId, title }: { id: number; nightId: number; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
      <span>
        <Link href={`/events/${nightId}`} className="line-through underline-offset-4 hover:underline">
          {title}
        </Link>{" "}
        · called off
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await reopenPoll(id);
            setError(res.ok ? null : res.error);
          })
        }
        className={buttonClass("ghost", "px-2 py-1 text-xs")}
      >
        <Undo2 className="size-3.5" /> {pending ? "Reopening…" : "Reopen"}
      </button>
      {error && <span role="alert" className="text-meeple-red">{error}</span>}
    </li>
  );
}

/** My answer to a date as it stands: what I said, can't when I left it after answering others, or none */
function myAnswer(d: DateView, me: number | null): { answer: DateAnswer | null; assumed: boolean } {
  if (me === null) return { answer: null, assumed: false };
  if (d.yes.some((v) => v.playerId === me)) return { answer: "yes", assumed: false };
  if (d.maybe.some((v) => v.playerId === me)) return { answer: "maybe", assumed: false };
  const no = d.no.find((v) => v.playerId === me);
  return no ? { answer: "no", assumed: no.assumed } : { answer: null, assumed: false };
}

function DateRow({
  date,
  myPlayerId,
  colors,
  canAnswer,
  onError,
}: {
  date: DateView;
  myPlayerId: number | null;
  colors: Record<string, MeepleColor | null>;
  canAnswer: boolean;
  onError: (error: string | null) => void;
}) {
  const current = myAnswer(date, myPlayerId);
  const [mine, setMine] = useOptimistic(current, (_was, next: { answer: DateAnswer | null; assumed: boolean }) => next);
  const [pending, start] = useTransition();
  // Everyone else as the server has them, and me as I've just answered
  const others = (list: Voter[]) => list.filter((v) => v.playerId !== myPlayerId);
  const me: Voter[] = myPlayerId === null ? [] : [{ playerId: myPlayerId, name: "You", userId: null }];
  const yes = [...others(date.yes), ...(mine.answer === "yes" ? me : [])];
  const maybe = [...others(date.maybe), ...(mine.answer === "maybe" ? me : [])];
  const coming = yes.length + maybe.length;
  const chip = (v: Voter) => <PlayerChip key={v.playerId} name={v.name} color={v.userId ? (colors[v.userId] ?? null) : null} />;

  return (
    <li className="space-y-2 rounded-lg border border-line bg-table/50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-36">
          <span className="block font-semibold">{date.label}</span>
          <span className="block text-xs text-slate">
            {date.soon && <span className="font-medium text-ink">{date.soon} · </span>}
            {date.time} · {coming ? `${coming} can come` : "nobody yet"}
          </span>
        </span>
        {canAnswer && myPlayerId !== null && (
          <span role="group" aria-label={`Can you make ${date.label}?`} className="inline-flex overflow-hidden rounded-md border border-line text-xs">
            {ANSWERS.map(({ answer, label }) => {
              const on = mine.answer === answer;
              return (
                <button
                  key={answer}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  title={on && mine.assumed ? "You didn't say, so it counts as can't" : undefined}
                  onClick={() =>
                    start(async () => {
                      if (on && !mine.assumed) return;
                      setMine({ answer, assumed: false });
                      const res = await answerDate(date.id, answer);
                      onError(res.ok ? null : res.error);
                    })
                  }
                  className={clsx(
                    "border-line px-2.5 py-1.5 not-first:border-l",
                    on && !mine.assumed && (answer === "no" ? "bg-ink/80 text-card" : "bg-felt text-felt-ink"),
                    on && mine.assumed && "bg-ink/10 italic",
                    !on && "bg-card hover:bg-table",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </span>
        )}
      </div>
      {(yes.length > 0 || maybe.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {yes.map(chip)}
          {maybe.length > 0 && (
            <>
              <span className="ml-1 text-xs text-slate">if they have to:</span>
              {maybe.map(chip)}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function SuggestForm({
  usualTime,
  pending,
  onCancel,
  onSubmit,
}: {
  usualTime: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { date: string; time: string }) => void;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({ date: String(f.get("date") ?? ""), time: String(f.get("time") ?? "") });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Date</span>
        <DateInput name="date" required className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Starts</span>
        <input name="time" type="time" required defaultValue={usualTime} className={field} />
      </label>
      <button className={buttonClass("primary")} disabled={pending}>
        {pending ? "Adding…" : "Add it"}
      </button>
      <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
        Cancel
      </button>
    </form>
  );
}

/** Set one of the dates, best first, showing who'd be going and who'd be a maybe */
function SetForm({ poll, pending, onCancel, onSubmit }: { poll: PollView; pending: boolean; onCancel: () => void; onSubmit: (optionId: number) => void }) {
  const ranked = rankDates(poll.dates);
  const [picked, setPicked] = useState(ranked[0]?.id ?? null);
  const names = (list: Voter[]) => list.map((v) => v.name).join(", ");

  return (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked !== null) onSubmit(picked);
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Which date</legend>
        {ranked.map((d) => (
          <label key={d.id} className="flex items-start gap-2 text-sm">
            <input type="radio" name="date" className="mt-1" checked={picked === d.id} onChange={() => setPicked(d.id)} />
            <span>
              <span className="font-medium">
                {d.label}, {d.time}
              </span>
              <span className="block text-xs text-slate">
                {d.yes.length ? `Works for ${names(d.yes)}` : "Nobody's said it works"}
                {d.maybe.length > 0 && ` · if they have to: ${names(d.maybe)}`}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-slate">Everyone&apos;s down as they answered: works is going, if they have to is a maybe, and can&apos;t is can&apos;t make it. They can change it after.</p>
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={pending || picked === null}>
          {pending ? "Setting it…" : "Set it"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Find a date: which kind of night (when the group has two), a few dates, each with a time, and optionally a name and place */
export function PollForm({ setup }: { setup: NightSetup }) {
  const [open, setOpen] = useState(false);
  const [night, setNight] = useState<Night>("core");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
        <CalendarPlus className="size-4" /> Find a date
      </button>
    );
  }

  return (
    <form
      className="max-w-lg space-y-3 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const dates = readDates(f);
        start(async () => {
          // Opens the event's page once it's made
          const res = await startPoll({ night, title: String(f.get("title") ?? ""), location: String(f.get("location") ?? "") || null, dates });
          if (!res.ok) setError(res.error);
        });
      }}
    >
      <p className="text-sm text-slate">
        Offer a few dates and everyone says which work. The event gets its page now{setup.discord ? " and its post in Discord" : ""}, and keeps them once the date&apos;s set.
      </p>
      {setup.nights.length > 1 && (
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Which kind of event</legend>
          {setup.nights.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={night === n}
              onClick={() => setNight(n)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-sm",
                night === n ? "border-ink/80 bg-felt text-felt-ink shadow-token" : "border-line bg-card",
              )}
            >
              {setup.names[n]}
            </button>
          ))}
        </fieldset>
      )}
      <DateRows />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="title" maxLength={100} placeholder={`${titleCase(setup.names[night])} (optional)`} className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Where</span>
        <input name="location" maxLength={200} placeholder="Sam's place" className={field} />
      </label>
      {error && <p role="alert" className="text-sm text-meeple-red">{error}</p>}
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={pending}>
          {pending ? "Starting…" : "Offer these dates"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
