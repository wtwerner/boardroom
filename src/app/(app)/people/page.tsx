import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CASUAL_NIGHT, NIGHT_NAMES, SITE_NAME } from "@/config";
import { Avatar, Empty, Meeple, NewBadge, PageHeader, Panel, Section, Skeleton, formatDate } from "@/components/ui";
import { hasMemberRole, listGuildMembers } from "@/lib/discord";
import { localDate } from "@/lib/nights";
import { inSentence } from "@/lib/text";
import { requireUser } from "@/lib/session";
import { getPeople, getPlayers, isNewMember, type PersonCard } from "@/lib/queries";
import { canWelcome, coreNightName, welcomeName } from "@/lib/welcome";
import { PeopleTabs } from "./tabs";
import { type Candidate, WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <>
      <PageHeader title="People">
        <PeopleTabs current="members" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <People />
      </Suspense>
    </>
  );
}

async function People() {
  const me = await requireUser();
  const people = getPeople();
  const invitedTo = coreNightName() ? `${coreNightName()} events` : SITE_NAME;
  const [{ members, notSignedUp, welcomed }, candidates] = await Promise.all([people, canWelcome() ? welcomeCandidates(people) : null]);

  return (
    <div className="space-y-10">
      <Section title={`Signed up (${members.length})`} action={<span className="text-xs text-slate">newest first</span>}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li key={m.id}>
              <MemberCard member={m} isMe={m.id === me.id} />
            </li>
          ))}
        </ul>
      </Section>

      {welcomed.length > 0 && (
        <Section title="Invited, not signed in yet">
          <Panel className="divide-y divide-line">
            {welcomed.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-3 py-2.5 text-sm">
                <Meeple color={w.color} />
                <span className="flex-1 font-medium">{w.name}</span>
                <span className="text-slate">
                  invited {w.by ? `by ${w.by}, ` : ""}
                  {formatDate(localDate(w.welcomedAt), { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </Panel>
        </Section>
      )}

      <Section title="In the play logs, not signed up yet">
        {notSignedUp.length ? (
          <>
            <p className="mb-3 text-sm text-slate">
              Regulars from past plays{CASUAL_NIGHT && `, ${inSentence(NIGHT_NAMES.casual)} included`}.{" "}
              {hasMemberRole() ? "Anyone given the group’s role in Discord" : "Anyone in the Discord server"} can sign in and their history
              comes with them; if it doesn&apos;t, merge the names in{" "}
              <Link href="/settings#players" className="text-accent underline-offset-4 hover:underline">Settings</Link>.
            </p>
            <Panel className="divide-y divide-line">
              {notSignedUp.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
                  <Meeple color={p.color} />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="tabular text-slate">
                    {`${p.nights} ${p.nights === 1 ? "event" : "events"}`}
                    {p.casualNights > 0 && `, ${p.casualNights === p.nights ? "all" : p.casualNights} at ${inSentence(NIGHT_NAMES.casual)}`}
                  </span>
                </div>
              ))}
            </Panel>
          </>
        ) : (
          <Empty>Everyone who comes regularly has signed up.</Empty>
        )}
      </Section>

      {candidates && (
        <Section title={`Invite someone to ${invitedTo}`}>
          <p className="mb-3 max-w-2xl text-sm text-slate">
            {coreNightName() ? `For a ${inSentence(NIGHT_NAMES.casual)} regular who wants in on the heavier games. ` : ""}The bot
            {hasMemberRole() ? " gives them the role in Discord," : ""} says hi and DMs them a link to get set up here. You can also right-click them
            in Discord and pick <strong className="font-semibold">Apps → {welcomeName()}</strong>.
          </p>
          {candidates.length ? (
            <WelcomeForm candidates={candidates} hasRole={hasMemberRole()} invitedTo={invitedTo} />
          ) : (
            <Empty>Everyone in the server already has the role.</Empty>
          )}
        </Section>
      )}
    </div>
  );
}

/**
 * Who in the server could be invited: no member role (or account) yet, and not invited already. Regulars
 * from the play logs come first. Without the Server Members Intent the server can't be listed,
 * so it's the regulars linked to a Discord account.
 */
async function welcomeCandidates(people: ReturnType<typeof getPeople>): Promise<Candidate[]> {
  const [server, players, { members, notSignedUp, welcomed }] = await Promise.all([listGuildMembers(), getPlayers(), people]);
  const nightsOf = new Map(notSignedUp.map((p) => [p.id, p.nights]));
  const byDiscord = new Map(players.filter((p) => p.discordId).map((p) => [p.discordId!, p]));
  const inGroup = new Set(members.map((m) => m.discordId).filter(Boolean));
  const pending = new Set(welcomed.map((w) => w.discordId).filter(Boolean));
  const nights = (discordId: string) => nightsOf.get(byDiscord.get(discordId)?.id ?? -1) ?? 0;

  const list: Candidate[] = server.length
    ? server
        .filter((m) => (m.hasRole === null ? !inGroup.has(m.id) : !m.hasRole) && !pending.has(m.id))
        .map((m) => ({ id: m.id, name: m.name, username: m.username, nights: nights(m.id) }))
    : players
        .filter((p) => p.discordId && !p.userId && !pending.has(p.discordId))
        .map((p) => ({ id: p.discordId!, name: p.name, username: null, nights: nights(p.discordId!) }));
  return list.sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name));
}

function MemberCard({ member: m, isMe }: { member: PersonCard; isMe: boolean }) {
  const stats = [
    `${m.nights} ${m.nights === 1 ? "event" : "events"}`,
    `${m.owned} owned`,
    `${m.rated} rated`,
  ];
  return (
    <Link href={`/people/${m.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 hover:border-ink/40">
      <Avatar src={m.image} name={m.name} color={m.color} className="size-11" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{m.name}</span>
          {isMe && <span className="text-xs text-slate">you</span>}
          {isNewMember(m.joinedAt) && <NewBadge />}
        </span>
        <span className="block text-xs text-slate">Joined {formatDate(localDate(m.joinedAt), { month: "short", day: "numeric" })}</span>
        <span className="tabular block text-xs text-slate">{stats.join(" · ")}</span>
      </span>
    </Link>
  );
}
