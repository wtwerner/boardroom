"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";
import { POLL_MAX_DATES } from "@/db/enums";
import { buttonClass } from "@/components/ui";

const field = "rounded-md border border-line bg-table px-2 py-1 text-sm";
const WEEKS = 5;
const DAY_MS = 86_400_000;

/** What the calendar needs from the server: today in the group's time zone, and the days that already have an event (YYYY-MM-DD) */
export type CalendarSetup = { today: string; taken: string[] };

const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const label = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(toMs(day)).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/**
 * Dates to offer, picked on a calendar: tap days to add or take them away, all at one time (the
 * group's usual) unless one's changed. Days that already have an event are dotted, and days
 * already on offer (`offered`) are ringed: they can be offered again at another time. `single`
 * picks one day, for suggesting a date. Renders inputs `readDates` reads back.
 */
export function DatePicker({
  legend = "Dates",
  setup,
  time: usual = "19:00",
  offered = [],
  max = POLL_MAX_DATES,
  single = false,
}: {
  legend?: string;
  setup: CalendarSetup;
  /** The time each date starts at unless it's changed (HH:MM) */
  time?: string;
  offered?: string[];
  max?: number;
  single?: boolean;
}) {
  const [picked, setPicked] = useState<{ day: string; time: string | null }[]>([]);
  const [time, setTime] = useState(usual);
  // A new usual time (another kind of night picked) is everyone's, unless it was changed by hand
  const [lastUsual, setLastUsual] = useState(usual);
  if (lastUsual !== usual) {
    setLastUsual(usual);
    if (time === lastUsual) setTime(usual);
  }
  const [page, setPage] = useState(0);
  const today = toMs(setup.today);
  // Weeks start on Sunday, from this week
  const first = today - new Date(today).getUTCDay() * DAY_MS + page * WEEKS * 7 * DAY_MS;
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => toDay(first + i * DAY_MS));
  const taken = new Set(setup.taken);
  const already = new Set(offered);
  const chosen = new Set(picked.map((p) => p.day));
  const full = !single && picked.length >= max;

  const toggle = (day: string) => {
    if (chosen.has(day)) setPicked(picked.filter((p) => p.day !== day));
    else if (single) setPicked([{ day, time: null }]);
    else if (!full) setPicked([...picked, { day, time: null }].sort((a, b) => a.day.localeCompare(b.day)));
  };

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="max-w-sm rounded-lg border border-line p-2">
        <div className="mb-1 flex items-center justify-between text-sm">
          <button type="button" aria-label="Earlier weeks" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded p-1 text-slate hover:text-ink disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-medium">
            {label(days[0], { month: "long" })}
            {label(days[0], { month: "long" }) !== label(days.at(-1)!, { month: "long" }) && ` – ${label(days.at(-1)!, { month: "long" })}`}
          </span>
          <button type="button" aria-label="Later weeks" onClick={() => setPage(page + 1)} className="rounded p-1 text-slate hover:text-ink">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} aria-hidden className="py-1 text-slate">
              {d}
            </span>
          ))}
          {days.map((day) => {
            const past = toMs(day) < today;
            const on = chosen.has(day);
            const offeredAlready = already.has(day);
            const dayNumber = Number(day.slice(8));
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={`${label(day, { weekday: "long", month: "long", day: "numeric" })}${taken.has(day) ? ", has an event" : ""}${offeredAlready ? ", on offer already" : ""}`}
                disabled={past || (full && !on)}
                onClick={() => toggle(day)}
                className={clsx(
                  "relative rounded-md py-1.5 tabular-nums",
                  on ? "bg-felt font-semibold text-felt-ink" : "hover:bg-table",
                  (past || (full && !on)) && "text-slate/40 hover:bg-transparent",
                  offeredAlready && !on && "ring-1 ring-accent",
                  day === setup.today && !on && !offeredAlready && "ring-1 ring-line",
                )}
              >
                {dayNumber === 1 ? label(day, { month: "short", day: "numeric" }) : dayNumber}
                {taken.has(day) && <span aria-hidden className={clsx("absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full", on ? "bg-felt-ink" : "bg-accent")} />}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate">{single ? "Starting at" : "All starting at"}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value || usual)} className={field} />
      </label>

      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((p, i) => (
            <li key={p.day} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pr-1 pl-2.5 text-sm">
              {label(p.day, { weekday: "short", month: "short", day: "numeric" })}
              <input
                type="time"
                aria-label={`Time on ${label(p.day, { weekday: "long", month: "long", day: "numeric" })}`}
                value={p.time ?? time}
                onChange={(e) => setPicked(picked.map((x) => (x.day === p.day ? { ...x, time: e.target.value || null } : x)))}
                className="rounded border-0 bg-transparent px-0.5 text-xs text-slate"
              />
              <button type="button" aria-label={`Take ${label(p.day, { month: "long", day: "numeric" })} off`} onClick={() => toggle(p.day)} className="rounded-full p-0.5 text-slate hover:text-meeple-red">
                <X className="size-3.5" />
              </button>
              <input type="hidden" name={`date-${i}`} value={p.day} />
              <input type="hidden" name={`time-${i}`} value={p.time ?? time} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate">{single ? "Tap a day." : `Tap the days to offer, up to ${max}.`}</p>
      )}
      {full && <p className="text-xs text-slate">That&apos;s {max}, the most there can be.</p>}
      {picked.length > 1 && (
        <button type="button" onClick={() => setPicked([])} className={buttonClass("ghost", "px-2 py-1 text-xs")}>
          Clear them
        </button>
      )}
    </fieldset>
  );
}

/** The dates picked on `DatePicker` */
export function readDates(f: FormData) {
  return [...f.keys()]
    .filter((k) => k.startsWith("date-"))
    .map((k) => ({ date: String(f.get(k) ?? ""), time: String(f.get(`time-${k.slice(5)}`) ?? "") }))
    .filter((d) => d.date);
}
