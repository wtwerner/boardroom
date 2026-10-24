"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { type ActionResult, welcomeToGroup } from "@/app/actions";
import { buttonClass } from "@/components/ui";

export type Candidate = { id: string; name: string; username: string | null; nights: number };

/**
 * Pick someone from the server and invite them to the core group's nights. Giving the role lets
 * them in to the site, so it says what's about to happen and asks once more first.
 */
export function WelcomeForm({ candidates, hasRole, invitedTo }: { candidates: Candidate[]; hasRole: boolean; invitedTo: string }) {
  const [id, setId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const picked = candidates.find((c) => c.id === id);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setState(null);
          setConfirming(true);
        }}
      >
        <select
          aria-label="Who to invite"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setConfirming(false);
          }}
          required
          className="min-w-0 flex-1 rounded-lg border border-line bg-table px-3 py-2 text-sm"
        >
          <option value="">Choose someone from the server…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.username && ` (@${c.username})`}
              {c.nights > 0 && ` · ${c.nights} ${c.nights === 1 ? "event" : "events"}`}
            </option>
          ))}
        </select>
        {!confirming && (
          <button className={buttonClass("secondary")} disabled={!id}>
            Invite
          </button>
        )}
      </form>

      {confirming && picked && (
        <div className="rounded-lg border border-ink/70 bg-card p-3 text-sm shadow-token">
          <p>
            Invite <strong>{picked.name}</strong> to {invitedTo}? The bot will {hasRole ? "give them the role in Discord, " : ""}say hi in the
            channel and DM them a link to get set up here.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={buttonClass("primary")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await welcomeToGroup(picked.id);
                  setState(res);
                  setConfirming(false);
                  if (res.ok) setId("");
                })
              }
            >
              {pending ? "Inviting…" : `Invite ${picked.name}`}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={pending} onClick={() => setConfirming(false)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {state && (
        <p role="status" className={clsx("text-sm whitespace-pre-line", state.ok ? "text-slate" : "text-meeple-red")}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </div>
  );
}
