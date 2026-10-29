"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CalendarPlus, Check, ExternalLink, Undo2 } from "lucide-react";
import clsx from "clsx";
import { type MeepleColor, type Night, POLL_MAX_DATES } from "@/db/enums";
import { callOffPoll, pickPollDate, reopenPoll, setPollVote, startPoll, suggestPollDate } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { PlayerChip, buttonClass } from "@/components/ui";
import { discordAppUrl } from "@/lib/discord-components";
import { rankDates } from "@/lib/poll-message";
import { titleCase } from "@/lib/text";
import type { NightSetup } from "../events/night-form";
import { DateRows, readDates } from "./date-rows";

type Voter = { playerId: number; name: string; userId: string | null };

/** A poll as Plan shows it, with its dates already written out in the group's time zone */
export type PollView = {
  id: number;
  title: string;
  /** What its kind of night is called, when the group has more than one kind */
  kindName: string | null;
  location: string | null;
  /** Its post in Discord */
  url: string | null;
  /** The time its dates start at, for suggesting another */
  usualTime: string;
  dates: {
    id: number;
    startsAt: string;
    /** "Thu, Nov 5" and "7:00 PM" */
    label: string;
    time: string;
    past: boolean;
    voters: Voter[];
    /** What the night's called if it's picked without a title: "11/5/26 Game Night" */
    defaultTitle: string;
  }[];
};

const field = "w-full rounded-md border border-line bg-table px-2.5 py-1.5 text-sm";

/**
 * A poll to find a date: each date with who it works for and Works for me, then suggesting
 * another, picking one (which makes the night and opens its page) or calling it off, which
 * CalledOffPoll can undo. The same as the buttons on its post in Discord.
 */
export function PollCard({ poll, myPlayerId, colors, hasTitle }: { poll: PollView; myPlayerId: number | null; colors: Record<string, MeepleColor | null>; hasTitle: boolean }) {
  const [open, setOpen] = useState<"suggest" | "pick" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? null));
      if (res.ok) after?.();
    });

  return (
    <article id={`poll-${poll.id}`} className="scroll-mt-20 space-y-3 rounded-xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight">{poll.title}</h3>
          <p className="text-sm text-slate">{["Picking a date", poll.kindName, poll.location].filter(Boolean).join(" · ")}</p>
        </div>
        {poll.url && (
          <a href={discordAppUrl(poll.url) ?? poll.url} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
            <ExternalLink className="size-3.5" /> Open in Discord
          </a>
        )}
      </header>

      <ul className="space-y-2">
        {poll.dates.map((d) => (
          <DateRow key={d.id} date={d} myPlayerId={myPlayerId} colors={colors} onError={setError} />
        ))}
      </ul>

      {open === "suggest" && (
        <SuggestForm
          usualTime={poll.usualTime}
          pending={pending}
          onCancel={() => setOpen(null)}
          onSubmit={(input) => run(() => suggestPollDate(poll.id, input), () => setOpen(null))}
        />
      )}
      {open === "pick" && (
        <PickForm
          poll={poll}
          hasTitle={hasTitle}
          pending={pending}
          onCancel={() => setOpen(null)}
          onSubmit={(optionId, input) => run(() => pickPollDate(poll.id, optionId, input))}
        />
      )}
      {error && <p role="alert" className="text-sm text-meeple-red">{error}</p>}

      {!open && (
        <div className="flex flex-wrap gap-2">
          {poll.dates.length < POLL_MAX_DATES && (
            <button type="button" onClick={() => setOpen("suggest")} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
              <CalendarPlus className="size-3.5" /> Suggest a date
            </button>
          )}
          {poll.dates.some((d) => !d.past) && (
            <button type="button" onClick={() => setOpen("pick")} className={buttonClass("primary", "px-2.5 py-1.5 text-xs")}>
              <Check className="size-3.5" strokeWidth={3} /> Pick the date
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Call off ${poll.title} without picking a date?`)) run(() => callOffPoll(poll.id));
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

/** A poll that was called off while one of its dates is still coming up, so it can be reopened with its votes */
export function CalledOffPoll({ id, title }: { id: number; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
      <span>
        <span className="line-through">{title}</span> · called off
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

function DateRow({
  date,
  myPlayerId,
  colors,
  onError,
}: {
  date: PollView["dates"][number];
  myPlayerId: number | null;
  colors: Record<string, MeepleColor | null>;
  onError: (error: string | null) => void;
}) {
  const [voters, setVoters] = useOptimistic(date.voters, (_v, next: Voter[]) => next);
  const [pending, start] = useTransition();
  const mine = voters.some((v) => v.playerId === myPlayerId);

  return (
    <li className={clsx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-table/50 px-3 py-2", date.past && "opacity-60")}>
      {/* On a phone the voters get their own line under the date and button, so they don't squeeze into a column */}
      <span className="min-w-36 flex-1 sm:flex-none">
        <span className={clsx("block font-semibold", date.past && "line-through")}>{date.label}</span>
        <span className="block text-xs text-slate">{date.past ? "Gone by" : date.time}</span>
      </span>
      <span className="order-last flex w-full min-w-0 flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1" aria-label={`Works for ${voters.length}`}>
        {voters.length ? (
          voters.map((v) => <PlayerChip key={v.playerId} name={v.name} color={v.userId ? (colors[v.userId] ?? null) : null} />)
        ) : (
          <span className="text-xs text-slate">Nobody yet</span>
        )}
      </span>
      {!date.past && (
        <button
          type="button"
          aria-pressed={mine}
          disabled={pending || myPlayerId === null}
          onClick={() =>
            start(async () => {
              setVoters(mine ? voters.filter((v) => v.playerId !== myPlayerId) : [...voters, { playerId: myPlayerId!, name: "You", userId: null }]);
              const res = await setPollVote(date.id, !mine);
              onError(res.ok ? null : res.error);
            })
          }
          className={buttonClass(mine ? "primary" : "secondary", "px-2.5 py-1.5 text-xs")}
        >
          {mine && <Check className="size-3.5" strokeWidth={3} />}
          Works for me
        </button>
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

/** Pick one of the dates, the most votes first, with the night's name and place */
function PickForm({
  poll,
  hasTitle,
  pending,
  onCancel,
  onSubmit,
}: {
  poll: PollView;
  hasTitle: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (optionId: number, input: { title: string; location: string | null }) => void;
}) {
  const ranked = rankDates(poll.dates);
  const [picked, setPicked] = useState(ranked[0]?.id ?? null);
  // Filled in for the date picked, and following it until someone types in it
  const [typed, setTyped] = useState<string | null>(hasTitle ? poll.title : null);
  const title = typed ?? ranked.find((d) => d.id === picked)?.defaultTitle ?? "";

  return (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked === null) return;
        const f = new FormData(e.currentTarget);
        onSubmit(picked, { title: String(f.get("title") ?? ""), location: String(f.get("location") ?? "") || null });
      }}
    >
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Which date</legend>
        {ranked.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name="date" checked={picked === d.id} onChange={() => setPicked(d.id)} />
            <span>
              {d.label}, {d.time}
              <span className="text-slate"> · {d.voters.length ? `${d.voters.length} can make it` : "nobody yet"}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="title" maxLength={100} value={title} onChange={(e) => setTyped(e.target.value)} className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Where</span>
        <input name="location" maxLength={200} defaultValue={poll.location ?? ""} className={field} />
      </label>
      <p className="text-xs text-slate">This makes the event, with everyone that date works for down as going. They can change it on the event.</p>
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={pending || picked === null}>
          {pending ? "Making it…" : "Make the event"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Start a poll: which kind of night (when the group has two), a few dates, each with a time, and optionally a name and place */
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
          const res = await startPoll({ night, title: String(f.get("title") ?? ""), location: String(f.get("location") ?? "") || null, dates });
          if (!res.ok) setError(res.error);
          else {
            setError(null);
            setOpen(false);
          }
        });
      }}
    >
      <p className="text-sm text-slate">
        Offer a few dates and everyone says which work.{setup.discord ? " It's posted to Discord too, where people can vote." : ""}
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
          {pending ? "Starting…" : "Start the poll"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
