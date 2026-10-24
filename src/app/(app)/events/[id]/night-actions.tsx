"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Night } from "@/db/enums";
import { deleteNight } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import { NightForm, type NightSetup } from "../night-form";

/** Edit or delete a night Boardroom runs. One with plays logged stays: they'd only make it again. */
export function NightActions({
  id,
  initial,
  canDelete,
  posted,
  setup,
}: {
  id: number;
  initial: { night: Night; title: string; date: string; time: string; location: string };
  canDelete: boolean;
  /** It has a post in Discord, which goes too */
  posted: boolean;
  setup: NightSetup;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) return <NightForm id={id} initial={initial} onDone={() => setEditing(false)} setup={setup} />;
  return (
    <span className="flex gap-1.5">
      <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "px-2.5 py-1.5 text-xs")}>
        <Pencil className="size-3.5" /> Edit
      </button>
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
