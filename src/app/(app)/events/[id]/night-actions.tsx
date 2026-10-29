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
  posted,
  setup,
}: {
  id: number;
  initial: { night: Night; title: string; date: string; time: string; location: string };
  canDelete: boolean;
  /** It's still coming up, so it can go back to a poll for another date */
  canFindNewDate: boolean;
  /** It has a post in Discord, which goes too */
  posted: boolean;
  setup: NightSetup;
}) {
  const [open, setOpen] = useState<"edit" | "date" | null>(null);
  const [pending, start] = useTransition();
  if (open === "edit") return <NightForm id={id} initial={initial} onDone={() => setOpen(null)} setup={setup} />;
  if (open === "date") return <NewDateForm id={id} title={initial.title} posted={posted} onDone={() => setOpen(null)} />;
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
function NewDateForm({ id, title, posted, onDone }: { id: number; title: string; posted: boolean; onDone: () => void }) {
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
        cleared, and the games proposed for it come back once a date&apos;s picked. If it came from a poll, that poll&apos;s other dates stay on.
      </p>
      <DateRows legend="Dates to offer" required={false} />
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
