"use client";

import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { type ActionResult, closeInvite, makeInvite, makePasswordLink } from "@/app/actions";
import { buttonClass } from "@/components/ui";

const input = "rounded-lg border border-line bg-table px-3 py-2 text-sm";

/** A link just made, to copy. It isn't kept, so it's only here until the page is left */
function NewLink({ link, note }: { link: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Without the site's address set, the server only knows the path
  const url = link.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${link}` : link;
  return (
    <div className="w-full space-y-1.5 rounded-lg border border-felt/50 bg-felt/10 p-3" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={field} readOnly aria-label="The link" value={url} onFocus={(e) => e.currentTarget.select()} className={clsx(input, "min-w-0 flex-1 bg-card font-mono text-xs")} />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              // No clipboard over plain http, and some in-app browsers refuse: select it, so they can copy it themselves
              setCopied(false);
              field.current?.focus();
            }
          }}
          className={buttonClass("secondary", "gap-1.5 px-2.5 py-1.5 text-xs")}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-slate">{note}</p>
    </div>
  );
}

function Failed({ result }: { result: ActionResult | null }) {
  return result && !result.ok ? (
    <p role="alert" className="text-xs text-meeple-red">
      {result.error}
    </p>
  ) : null;
}

type Player = { id: number; name: string };

/** Make an invite: for everyone in a chat, or for one person, who may be someone in past plays */
export function InviteForm({ players, casual, limit }: { players: Player[]; /** The casual night's name, when there is one */ casual: string | null; /** A link for the group's chat: how many people, for how many days */ limit: { people: number; days: number } }) {
  const [group, setGroup] = useState(true);
  const [access, setAccess] = useState<"member" | "casual">("member");
  const [label, setLabel] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const choice = (on: boolean) => clsx("rounded-md px-2.5 py-1.5 text-sm font-medium", on ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink");

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await makeInvite({ access, group, label, playerId: !group && playerId ? Number(playerId) : null });
          setResult(res);
          if (res.ok) {
            setLabel("");
            setPlayerId("");
          }
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        <div role="group" aria-label="Who it's for" className="flex gap-0.5 rounded-lg border border-line bg-table p-0.5">
          <button type="button" aria-pressed={group} onClick={() => setGroup(true)} className={choice(group)}>
            The group&apos;s chat
          </button>
          <button type="button" aria-pressed={!group} onClick={() => setGroup(false)} className={choice(!group)}>
            One person
          </button>
        </div>
        {casual && (
          <div role="group" aria-label="What they'll be" className="flex gap-0.5 rounded-lg border border-line bg-table p-0.5">
            <button type="button" aria-pressed={access === "member"} onClick={() => setAccess("member")} className={choice(access === "member")}>
              Member
            </button>
            <button type="button" aria-pressed={access === "casual"} onClick={() => setAccess("casual")} className={choice(access === "casual")}>
              {casual} only
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {!group && players.length > 0 && (
          <label className="space-y-1">
            <span className="block text-xs text-slate">In past plays as</span>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={clsx(input, "w-48")}>
              <option value="">Nobody yet</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-40 flex-1 space-y-1">
          <span className="block text-xs text-slate">A note for you (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={group ? "WhatsApp group" : "Riley"} className={clsx(input, "w-full")} />
        </label>
        <button disabled={pending} className={buttonClass("primary")}>
          {pending ? "Making…" : "Make the link"}
        </button>
      </div>
      <p className="text-xs text-slate">
        {group
          ? `Anyone with the link can make an account for ${limit.days === 1 ? "a day" : `${limit.days} days`}, up to ${limit.people === 1 ? "1 person" : `${limit.people} people`}. Send it only where the group talks. The limits are on Group settings.`
          : "Works once, for two weeks. Choosing their name in past plays gives them those plays."}
        {access === "member" && " Members can edit and delete the group's plays and events."}
      </p>
      {result?.ok && result.link && <NewLink link={result.link} note="Copy it now: it's only shown this once. You can turn it off below." />}
      <Failed result={result} />
    </form>
  );
}

export function CloseInvite({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await closeInvite(id)))} className={buttonClass("ghost", "px-2 py-1 text-xs text-meeple-red")}>
        Turn off
      </button>
      <Failed result={result} />
    </span>
  );
}

/** For someone who forgot their password, or has only used Discord */
export function PasswordLinkButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Make a link for ${name} to choose a new password? Whoever opens it can sign in as ${name}, so send it only to them.`)) start(async () => setResult(await makePasswordLink(userId)));
        }}
        className={buttonClass("ghost", "px-2 py-1 text-xs")}
      >
        Password link
      </button>
      {result?.ok && result.link && <NewLink link={result.link} note={`Send it to ${name} and nobody else. It works once, for a day.`} />}
      <Failed result={result} />
    </>
  );
}
