import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { CASUAL_NIGHT, CASUAL_SIGN_IN, DEMO, NIGHT_NAMES } from "@/config";
import type { Access } from "@/db/enums";
import { Avatar, DemoNote, Empty, Meeple, PageHeader, Panel, Section, Skeleton, TextLink, formatDate } from "@/components/ui";
import { type Allowed, capabilities, roleMismatch } from "@/lib/access";
import { hasMemberRole, listGuildMembers } from "@/lib/discord";
import { type AccessOverview, getAccessOverview } from "@/lib/queries";
import { canManageGroup, requireMemberPage } from "@/lib/session";
import { inSentence } from "@/lib/text";
import { AccessControls, MatchDiscordButton } from "./access-controls";

export const metadata: Metadata = { title: "People and access" };

export default function AccessPage() {
  return (
    <>
      <PageHeader title="People and access" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <PeopleAndAccess />
      </Suspense>
    </>
  );
}

type Account = AccessOverview["accounts"][number];
/** Whether they hold Discord's member role, or null when the group has no role or Discord couldn't say */
type RoleState = { inServer: boolean; hasRole: boolean | null };

/**
 * For admins only: who's a member, who has a casual account and who's off the site, what each can
 * do, and where Discord's member role disagrees. Everyone else gets the not-found page.
 */
async function PeopleAndAccess() {
  const me = await requireMemberPage();
  if (!(await canManageGroup())) notFound();
  const [{ accounts, regulars }, server] = await Promise.all([getAccessOverview(), listGuildMembers()]);
  // Discord's view, when the bot can read the server: who's in it and who holds the role
  const discord = new Map(server.map((m) => [m.id, m]));
  const roleOf = (discordId: string | null): RoleState | null => {
    if (!discordId || server.length === 0) return null;
    const m = discord.get(discordId);
    return { inServer: Boolean(m), hasRole: m ? m.hasRole : null };
  };
  const readOnly = DEMO;
  const casualName = NIGHT_NAMES.casual;
  const names = { core: inSentence(NIGHT_NAMES.core), casual: inSentence(NIGHT_NAMES.casual) };
  // Without a casual night there's no casual side to the site: nobody's moved there, and anyone already there can't sign in
  const showCasual = CASUAL_NIGHT || accounts.some((a) => a.access === "casual");
  const rows = capabilities(names);
  const byAccess = (a: Access) => accounts.filter((x) => x.access === a);
  const members = byAccess("member").sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));
  const casual = byAccess("casual");
  const removed = byAccess("removed");
  const mismatched = accounts.filter((a) => {
    const r = roleOf(a.discordId);
    return r?.inServer && roleMismatch(a.access, r.hasRole);
  });

  const row = (a: Account) => (
    <PersonRow key={a.id} a={a} role={roleOf(a.discordId)} isMe={a.id === me.id} names={names} casualName={casualName} readOnly={readOnly} />
  );

  return (
    <div className="max-w-4xl space-y-10">
      <div className="space-y-3">
        <TextLink href="/settings" className="inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-3.5" /> Settings
        </TextLink>
        <p className="max-w-2xl text-sm text-slate">
          Who&apos;s a member{showCasual && `, who has a ${names.casual} account`}, and who&apos;s off the site.
          It&apos;s decided here, and only admins see this page.{hasMemberRole() && " Discord's member role follows what you choose."}
        </p>
        {readOnly && <DemoNote className="rounded-lg px-3 py-2">On the demo you can look, but changes are off.</DemoNote>}
      </div>

      <dl className={clsx("grid gap-px overflow-hidden rounded-xl border border-line bg-line", showCasual ? "grid-cols-3" : "grid-cols-2")}>
        <Tile label="Members" value={members.length} note={`${members.filter((m) => m.isAdmin).length} admin${members.filter((m) => m.isAdmin).length === 1 ? "" : "s"}`} />
        {showCasual && <Tile label={`${casualName} accounts`} value={casual.length} note={signInNote()} />}
        <Tile label="Off the site" value={removed.length} note="can't sign in" />
      </dl>

      {mismatched.length > 0 && (
        <Section title="Discord doesn't match">
          <p className="mb-3 max-w-2xl text-sm text-slate">
            Someone changed the member role in Discord by hand, or the bot couldn&apos;t. Boardroom goes by what&apos;s here: match Discord to it, or
            change them below.
          </p>
          <Panel className="divide-y divide-line border-meeple-yellow/70">
            {mismatched.map((a) => {
              const extra = roleMismatch(a.access, roleOf(a.discordId)?.hasRole ?? null) === "extra-role";
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <Avatar src={a.image} name={a.name} color={a.color} className="size-7" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.name}</span>
                    <span className="block text-xs text-slate">
                      {extra
                        ? `${a.access === "removed" ? "Off the site" : `${casualName} only here`}, but has the member role in Discord, so sees the ${names.core}'s channels`
                        : "A member here, but doesn't have the member role in Discord"}
                    </span>
                  </span>
                  <MatchDiscordButton userId={a.id} readOnly={readOnly} />
                </div>
              );
            })}
          </Panel>
        </Section>
      )}

      <Section title={`Members (${members.length})`}>
        <Panel className="divide-y divide-line">{members.map(row)}</Panel>
      </Section>

      {showCasual && (
        <Section title={`${casualName} accounts (${casual.length})`}>
          {!CASUAL_NIGHT && (
            <p className="mb-3 max-w-2xl text-sm text-slate">
              &quot;A casual night too&quot; is off on Group settings, so they can&apos;t sign in. Everything of theirs is kept: make them a member, take
              them off the site, or turn it back on.
            </p>
          )}
          {casual.length ? (
            <Panel className="divide-y divide-line">{casual.map(row)}</Panel>
          ) : (
            <Empty>
              {CASUAL_SIGN_IN
                ? `Nobody yet. Anyone in the Discord server without the member role gets one when they sign in.`
                : `Nobody yet. Turn on "${NIGHT_NAMES.casual} players can sign in" on Group settings to let them.`}
            </Empty>
          )}
        </Section>
      )}

      {removed.length > 0 && (
        <Section title={`Off the site (${removed.length})`}>
          <Panel className="divide-y divide-line">{removed.map(row)}</Panel>
        </Section>
      )}

      {CASUAL_NIGHT && regulars.length > 0 && (
        <Section title={`${NIGHT_NAMES.casual} regulars without an account`}>
          <p className="mb-3 max-w-2xl text-sm text-slate">
            Came twice or more in the last year.{" "}
            {CASUAL_SIGN_IN
              ? "Once they're in the Discord server, they can sign in."
              : `They could sign in once "${casualName} players can sign in" is on and they're in the Discord server.`}
          </p>
          <Panel className="divide-y divide-line">
            {regulars.map((r) => {
              // Only Discord can say whether someone's in the server; a player with no Discord linked might be anyway
              const where = !r.discordId ? "Discord not linked" : !server.length ? null : discord.has(r.discordId) ? "In Discord" : "Not in Discord";
              return (
                <div key={r.playerId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <Meeple color={r.color} />
                  <span className="min-w-0 flex-1 font-medium">{r.name}</span>
                  <span className="tabular text-xs text-slate">
                    {r.casual} {r.casual === 1 ? "night" : "nights"}
                    {r.last && `, last ${formatDate(r.last, { month: "short", day: "numeric" })}`}
                  </span>
                  {where && <Chip tone={where === "In Discord" ? "ok" : "muted"}>{where}</Chip>}
                </div>
              );
            })}
          </Panel>
        </Section>
      )}

      <Section title="What each can do">
        <p className="mb-3 max-w-2xl text-sm text-slate">
          {showCasual
            ? `${casualName} accounts see everything but the ${names.core}'s events, plays and group list, which aren't there for them rather than shown as locked. Running events and the group's housekeeping are the members'.`
            : "Members can do everything with the group's things; admins also look after the group."}
        </p>
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-slate">
                <th className="py-2 pr-2 pl-3 font-medium">Can…</th>
                <th className="w-24 px-2 py-2 text-center font-medium">Admins</th>
                <th className="w-24 px-2 py-2 text-center font-medium">Members</th>
                {showCasual && <th className="w-28 px-2 py-2 text-center font-medium">{casualName}</th>}
              </tr>
            </thead>
            {[...new Set(rows.map((c) => c.area))].map((area) => (
              <tbody key={area} className="border-b border-line last:border-0">
                <tr>
                  <th colSpan={showCasual ? 4 : 3} className="bg-table/60 px-3 pt-2.5 pb-1 text-left text-[0.7rem] font-semibold tracking-wider text-slate uppercase">
                    {area}
                  </th>
                </tr>
                {rows.filter((c) => c.area === area && (showCasual || !c.aboutCasual)).map((c) => (
                  <tr key={c.what}>
                    <td className="py-1.5 pr-2 pl-3">{c.what}</td>
                    <td className="px-2 py-1.5 text-center">
                      <Cell allowed={c.admin} casualName={casualName} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Cell allowed={c.member} casualName={casualName} />
                    </td>
                    {showCasual && (
                      <td className="px-2 py-1.5 text-center">
                        <Cell allowed={c.casual} casualName={casualName} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Panel>
      </Section>
    </div>
  );
}

/** Whether new people without the member role get a casual account, for the tile under the count */
function signInNote() {
  if (!CASUAL_NIGHT) return "can't sign in";
  return CASUAL_SIGN_IN ? "sign-in on" : "sign-in off";
}

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="font-display tabular mt-0.5 text-3xl">{value}</dd>
      <dd className="text-xs text-slate">{note}</dd>
    </div>
  );
}

function PersonRow({
  a,
  role,
  isMe,
  names,
  casualName,
  readOnly,
}: {
  a: Account;
  role: RoleState | null;
  isMe: boolean;
  names: { core: string; casual: string };
  casualName: string;
  readOnly: boolean;
}) {
  const nights = [
    a.coreNights > 0 && `${a.coreNights} ${CASUAL_NIGHT ? names.core : "event"}${a.coreNights === 1 ? "" : "s"}`,
    a.casualNights > 0 && `${a.casualNights} ${names.casual}${a.casualNights === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const facts = [
    nights.length ? `${nights.join(", ")} in the last year` : "no events in the last year",
    a.rated > 0 && `${a.rated} rated`,
    a.lastSeen ? `on the site ${formatDate(new Date(a.lastSeen).toISOString().slice(0, 10), { month: "short", day: "numeric" })}` : null,
  ].filter(Boolean);
  const mismatch = role?.inServer ? roleMismatch(a.access, role.hasRole) : null;
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={a.image} name={a.name} color={a.color} className={clsx("size-8 shrink-0", a.access === "removed" && "opacity-50")} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{a.name}</span>
            {isMe && <span className="text-xs text-slate">(you)</span>}
            {a.isAdmin && <Chip tone="ok">Admin</Chip>}
            {role && !role.inServer && <Chip tone="warn">Left Discord</Chip>}
            {role?.inServer && role.hasRole !== null && (
              <Chip tone={mismatch ? "warn" : "muted"}>{role.hasRole ? "Has the role" : "No role"}</Chip>
            )}
          </span>
          <span className="block text-xs text-slate">{facts.join(" · ")}</span>
        </span>
      </div>
      <AccessControls
        userId={a.id}
        name={a.name}
        access={a.access}
        isAdmin={a.isAdmin}
        isMe={isMe}
        names={names}
        casualName={casualName}
        offerCasual={CASUAL_NIGHT}
        readOnly={readOnly}
      />
    </div>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "rounded-full px-1.5 py-px text-[0.65rem] font-medium whitespace-nowrap",
        tone === "ok" && "bg-felt/15 text-ink",
        tone === "warn" && "bg-meeple-yellow/25 text-ink",
        tone === "muted" && "bg-table text-slate",
      )}
    >
      {children}
    </span>
  );
}

function Cell({ allowed, casualName }: { allowed: Allowed; casualName: string }) {
  if (allowed === "yes") return <Check className="mx-auto size-4 text-felt" strokeWidth={3} aria-label="Yes" />;
  if (allowed === "no") return <Minus className="mx-auto size-4 text-slate/50" aria-label="No" />;
  return (
    <span className="rounded-full bg-night-casual/20 px-1.5 py-px text-[0.7rem] font-medium whitespace-nowrap">
      {allowed === "own" ? "Their own" : casualName}
    </span>
  );
}
