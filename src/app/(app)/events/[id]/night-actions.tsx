"use client";

import { useState, useTransition } from "react";
import { CalendarSync, Pencil, Trash2 } from "lucide-react";
import type { Night } from "@/db/enums";
import { deleteNight, findNewDate } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import { DateRows, readDates } from "../../plan/date-rows";
import { NightForm, type NightSetup } from "../night-form";

/** Edit or delete a night Boardroom runs. One with plays logged stays: they'd only make it again. */
export function NightActions({
  id,
  initial,
  canDelete,
  canFindNewDate,
  staying,
  posted,
  setup,
}: {
  id: number;
  initial: { night: Night; title: string; date: string; time: string; location: string };
  canDelete: boolean;
  /** It's still coming up, so it can go back to a poll for another date */
  canFindNewDate: boolean;
  /** The other dates on the poll it was picked from, as they'll stay on it: "Sun, Nov 8, 7:30 PM · 3 can make it" */
  staying: string[];
  /** It has a post in Discord, which goes too */
  posted: boolean;
  setup: NightSetup;
}) {
  const [open, setOpen] = useState<"edit" | "date" | null>(null);
  const [pending, start] = useTransition();
  if (open === "edit") return <NightForm id={id} initial={initial} onDone={() => setOpen(null)} setup={setup} />;
  if (open === "date") return <NewDateForm id={id} title={initial.title} night={initial.night} staying={staying} posted={posted} onDone={() => setOpen(null)} />;
  return (
    <span className="flex gap-1.5">
      <button type="button" onClick={() => setOpen("edit")} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
        <Pencil className="size-3.5" /> Edit
      </button>
      {canFindNewDate && (
        <button type="button" onClick={() => setOpen("date")} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
          <CalendarSync className="size-3.5" /> Find a new date
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const also = posted ? ", the games planned for it, and its post in Discord" : ", and the games planned for it";
            if (confirm(`Delete ${initial.title}${also}?`)) start(async () => void (await deleteNight(id)));
          }}
          className={buttonClass("ghost", "px-2.5 py-1.5 text-xs")}
        >
          <Trash2 className="size-3.5" /> Delete
        </button>
      )}
    </span>
  );
}

/** The night goes back to a poll: its date comes off, a few more go on, and its games wait for the pick */
function NewDateForm({
  id,
  title,
  night,
  staying,
  posted,
  onDone,
}: {
  id: number;
  title: string;
  night: Night;
  staying: string[];
  posted: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="w-full max-w-lg space-y-3 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dates = readDates(new FormData(e.currentTarget));
        start(async () => {
          const res = await findNewDate(id, dates);
          if (!res.ok) setError(res.error);
        });
      }}
    >
      <p className="text-sm text-slate">
        {title} goes back to a poll without this date, and everyone says which dates work instead.{posted ? " Its post in Discord turns back into the poll." : ""} Answers are
        cleared, and {night === "casual" ? "the games people are bringing" : "the games proposed for it"} come back once a date&apos;s picked.
      </p>
      {staying.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 font-medium">Staying on the poll, with their votes</p>
          <ul className="space-y-0.5 text-slate">
            {staying.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      <DateRows legend={staying.length ? "More dates to offer" : "Dates to offer"} rows={staying.length ? 1 : 2} required={!staying.length} />
      {error && (
        <p role="alert" className="text-sm text-meeple-red">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={pending}>
          {pending ? "Moving…" : "Back to a poll"}
        </button>
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
