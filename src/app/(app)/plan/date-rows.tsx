"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import clsx from "clsx";
import { POLL_MAX_DATES } from "@/db/enums";
import { DateInput } from "@/components/date-input";
import { buttonClass } from "@/components/ui";

const field = "w-full rounded-md border border-line bg-table px-2.5 py-1.5 text-sm";

/** A poll's dates to offer: rows of a date and a time, one more added or any taken away. `readDates` reads them back. */
export function DateRows({ legend = "Dates", rows: start = 2, required = true }: { legend?: string; rows?: number; required?: boolean }) {
  const [rows, setRows] = useState(() => Array.from({ length: start }, (_, i) => i));
  const [next, setNext] = useState(start);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {rows.map((r, i) => (
        <div key={r} className="flex items-center gap-2">
          <DateInput name={`date-${r}`} required={required && i === 0} aria-label={`Date ${i + 1}`} className={field} />
          <input name={`time-${r}`} type="time" required defaultValue="19:00" aria-label={`Time ${i + 1}`} className={clsx(field, "w-32")} />
          {rows.length > 1 && (
            <button type="button" aria-label={`Remove date ${i + 1}`} onClick={() => setRows(rows.filter((x) => x !== r))} className="rounded p-1 text-slate hover:text-meeple-red">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      {rows.length < POLL_MAX_DATES && (
        <button
          type="button"
          onClick={() => {
            setRows([...rows, next]);
            setNext(next + 1);
          }}
          className={buttonClass("ghost", "px-2 py-1 text-xs")}
        >
          <Plus className="size-3.5" /> Another date
        </button>
      )}
    </fieldset>
  );
}

/** The dates filled in on `DateRows`, leaving out empty rows */
export function readDates(f: FormData) {
  return [...f.keys()]
    .filter((k) => k.startsWith("date-"))
    .map((k) => ({ date: String(f.get(k) ?? ""), time: String(f.get(`time-${k.slice(5)}`) ?? "") }))
    .filter((d) => d.date);
}
