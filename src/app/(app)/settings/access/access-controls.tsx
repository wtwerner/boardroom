"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { type ActionResult, matchDiscordRole, setAccess, setAdmin } from "@/app/actions";
import type { Access } from "@/db/enums";
import { buttonClass } from "@/components/ui";

/**
 * One person's access, for an admin: member or casual, admin or not, and taking them off the
 * site (or letting them back on, as either). Moving down or off asks first, since it takes them
 * off upcoming events; the line under it says how it went, including when Discord's role didn't follow.
 */
export function AccessControls(props: {
  userId: string;
  name: string;
  access: Access;
  isAdmin: boolean;
  isMe: boolean;
  /** The nights' names, mid-sentence */
  names: { core: string; casual: string };
  /** The casual night's name, for the casual option */
  casualName: string;
  /** The group has a casual night, so someone can be moved there */
  offerCasual: boolean;
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult | undefined | void>) =>
    start(async () => {
      const res = await fn();
      setResult(res ?? null);
    });
  const locked = props.readOnly || props.isMe;
  const tab = (active: boolean) =>
    clsx("rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed", active ? "bg-card text-ink shadow-token" : "text-slate enabled:hover:text-ink");

  const moveDown = () => {
    if (confirm(`Move ${props.name} to the ${props.names.casual} only? They stop seeing the ${props.names.core}'s events and pages, and their answers for upcoming ones are taken off.`))
      run(() => setAccess(props.userId, "casual"));
  };

  if (props.access === "removed") {
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        {!props.readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate">Let back in as</span>
            <button type="button" disabled={pending} onClick={() => run(() => setAccess(props.userId, "member"))} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
              Member
            </button>
            {props.offerCasual && (
              <button type="button" disabled={pending} onClick={() => run(() => setAccess(props.userId, "casual"))} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
                {props.casualName}
              </button>
            )}
          </div>
        )}
        <Status result={result} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={`${props.name}'s access`} className="flex gap-0.5 rounded-lg border border-line bg-table p-0.5">
          <button
            type="button"
            disabled={locked || pending || props.isAdmin}
            aria-pressed={props.access === "member"}
            onClick={() => run(() => setAccess(props.userId, "member"))}
            className={tab(props.access === "member")}
          >
            Member
          </button>
          {(props.offerCasual || props.access === "casual") && (
            <button
              type="button"
              disabled={locked || pending || props.isAdmin || !props.offerCasual}
              aria-pressed={props.access === "casual"}
              title={props.isAdmin ? "Take their admin away first" : undefined}
              onClick={moveDown}
              className={tab(props.access === "casual")}
            >
              {props.casualName}
            </button>
          )}
        </div>
        {props.access === "member" && (
          <label className={clsx("flex items-center gap-1.5 text-xs", locked ? "text-slate" : "cursor-pointer")}>
            <input
              type="checkbox"
              checked={props.isAdmin}
              disabled={props.readOnly || pending}
              onChange={(e) => run(() => setAdmin(props.userId, e.target.checked))}
              className="size-3.5 accent-[var(--felt)]"
            />
            Admin
          </label>
        )}
        {!locked && !props.isAdmin && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Take ${props.name} off the site? They're signed out now, their answers for upcoming events are taken off, and they can't sign back in until an admin lets them.`))
                run(() => setAccess(props.userId, "removed"));
            }}
            className={buttonClass("ghost", "px-2 py-1 text-xs text-meeple-red")}
          >
            Remove
          </button>
        )}
      </div>
      <Status result={result} />
    </div>
  );
}

/** For a mismatch: make Discord's member role match what they are here */
export function MatchDiscordButton({ userId, readOnly }: { userId: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  if (readOnly) return null;
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await matchDiscordRole(userId)))} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
        {pending ? "Matching…" : "Match Discord"}
      </button>
      <Status result={result} />
    </span>
  );
}

function Status({ result }: { result: ActionResult | null }) {
  if (!result || (result.ok && !result.message)) return null;
  return (
    <p role="status" className={clsx("max-w-72 text-xs sm:text-right", result.ok ? "text-slate" : "text-meeple-red")}>
      {result.ok ? result.message : result.error}
    </p>
  );
}
