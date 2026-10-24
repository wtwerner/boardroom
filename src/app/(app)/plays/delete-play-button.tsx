"use client";

import { Trash2 } from "lucide-react";
import { deletePlay } from "@/app/actions";

export function DeletePlayButton({ id, name, postedByApp }: { id: number; name: string; postedByApp: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Delete this play of ${name}`}
      className="rounded-md p-1.5 text-slate hover:text-meeple-red pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
      onClick={() => {
        if (confirm(`Delete this play of ${name}?${postedByApp ? " Its Discord post will be removed too." : ""}`)) deletePlay(id);
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
