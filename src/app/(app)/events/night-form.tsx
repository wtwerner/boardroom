"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import type { Night } from "@/db/enums";
import { addNight, updateNight } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { buttonClass } from "@/components/ui";
import { titleCase } from "@/lib/text";

type Values = { night: Night; title: string; date: string; time: string; location: string };

/** From the server's config: which nights the group has, what each is called, and whether the ones added here are posted to Discord */
export type NightSetup = { nights: readonly Night[]; names: Record<Night, string>; discord: boolean };

const field = "w-full rounded-md border border-line bg-table px-2.5 py-1.5 text-sm";

/**
 * A night: it's posted to Discord when the group has that set up. Adding one opens its page;
 * editing saves in place.
 */
export function NightForm({ id, initial, onDone, setup }: { id?: number; initial?: Values; onDone?: () => void; setup: NightSetup }) {
  const [open, setOpen] = useState(Boolean(id));
  const [night, setNight] = useState<Night>(initial?.night ?? "core");
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
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="title" required maxLength={100} defaultValue={initial?.title ?? ""} placeholder={titleCase(setup.names[night])} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <DateInput name="date" required defaultValue={initial?.date ?? ""} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Starts</span>
          <input name="time" type="time" required defaultValue={initial?.time ?? "19:00"} className={field} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Where</span>
        <input name="location" maxLength={200} defaultValue={initial?.location ?? ""} placeholder="Sam's place" className={field} />
      </label>
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
