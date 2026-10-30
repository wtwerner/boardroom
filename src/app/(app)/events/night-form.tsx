"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import type { Night } from "@/db/enums";
import { addNight, updateNight } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { buttonClass } from "@/components/ui";
import { fillTitle, titleGame } from "@/lib/night-title";

type Values = { night: Night; title: string; date: string; time: string; location: string; capacity: number | null };

/**
 * From the server's config: which nights the group has, what each is called, the template a
 * night's name is made from, and whether the ones added here are posted to Discord
 */
export type NightSetup = { nights: readonly Night[]; names: Record<Night, string>; titles: Record<Night, string>; discord: boolean };

const field = "w-full rounded-md border border-line bg-table px-2.5 py-1.5 text-sm";

/**
 * A night: it's posted to Discord when the group has that set up. Adding one opens its page;
 * editing saves in place. Its name fills in from the group's template as the date is picked,
 * and keeps following the date and kind until someone types in it.
 */
export function NightForm({ id, initial, onDone, setup }: { id?: number; initial?: Values; onDone?: () => void; setup: NightSetup }) {
  const [open, setOpen] = useState(Boolean(id));
  const [night, setNight] = useState<Night>(initial?.night ?? "core");
  const [date, setDate] = useState(initial?.date ?? "");
  // The game in a name the template made (TBD before one's locked in), or null for one typed in
  const game = initial ? titleGame(initial.title, setup.titles[initial.night], initial.date) : "";
  const [typed, setTyped] = useState<string | null>(initial && game === null ? initial.title : null);
  const title = typed ?? (date ? fillTitle(setup.titles[night], date, game || null) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
        <Plus className="size-4" /> Add an event
      </button>
    );
  }

  return (
    <form
      className="max-w-lg space-y-3 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const values = {
          night,
          title: String(f.get("title") ?? ""),
          date: String(f.get("date") ?? ""),
          time: String(f.get("time") ?? ""),
          location: String(f.get("location") ?? "") || null,
          capacity: Number(f.get("capacity")) || null,
        };
        start(async () => {
          const res = id ? await updateNight(id, values) : await addNight(values);
          if (!res.ok) setError(res.error);
          else {
            setError(null);
            onDone?.();
          }
        });
      }}
    >
      {setup.nights.length > 1 && (
        <fieldset className="flex flex-wrap gap-1.5">
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
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <DateInput name="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Starts</span>
          <input name="time" type="time" required defaultValue={initial?.time ?? "19:00"} className={field} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input
          name="title"
          required
          maxLength={100}
          value={title}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Fills in once there's a date"
          className={field}
        />
      </label>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Where</span>
          <input name="location" maxLength={200} defaultValue={initial?.location ?? ""} placeholder="Sam's place" className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Seats</span>
          <input name="capacity" type="number" inputMode="numeric" min={1} max={100} defaultValue={initial?.capacity ?? ""} placeholder="No limit" className={field} />
        </label>
      </div>
      {/* Only when adding: editing opens in the night's header, which this would widen on a phone */}
      {!id && <p className="-mt-1 text-xs text-slate">With a seat limit, anyone going once it&apos;s full waits for a seat, and gets the next one that opens.</p>}
      {error && <p role="alert" className="text-sm text-meeple-red">{error}</p>}
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={pending}>
          {pending ? "Saving…" : id ? "Save" : "Add it"}
        </button>
        <button type="button" onClick={() => (id ? onDone?.() : setOpen(false))} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
