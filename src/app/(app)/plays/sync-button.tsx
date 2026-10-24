"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { type ActionResult, syncDiscordNow } from "@/app/actions";
import { buttonClass } from "@/components/ui";

export function SyncDiscordButton() {
  const [state, action, pending] = useActionState<ActionResult | null>(syncDiscordNow, null);
  return (
    <form action={action} className="flex items-center gap-3">
      {state && (
        <span role="status" className={state.ok ? "text-sm text-slate" : "text-sm text-meeple-red"}>
          {state.ok ? state.message : state.error}
        </span>
      )}
      <button className={buttonClass("secondary")} disabled={pending}>
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Syncing…" : "Sync from Discord"}
      </button>
    </form>
  );
}
