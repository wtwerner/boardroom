import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { GROUP_NIGHTS, NIGHT_NAMES, TIME_ZONE } from "@/config";
import { Empty, PageHeader, Section, Skeleton, buttonClass } from "@/components/ui";
import { NightRow } from "@/components/night-row";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/session";
import { getMembers } from "@/lib/queries";
import { commandName, postsNights } from "@/lib/discord";
import { getPastNights, getUpcomingNights } from "@/lib/events";
import { NightForm } from "../events/night-form";
import { calledOffPolls, openPolls } from "@/lib/poll-store";
import { pollTitle } from "@/lib/poll-post";
import { localDate, nightTitle, nightWhen } from "@/lib/nights";
import { CalledOffPoll, PollCard, PollForm, type PollView } from "./polls";

export const metadata: Metadata = { title: "Plan" };

/** Past nights shown at first, and how many more each "Show more" adds */
const PAST_STEP = 10;

export default function PlanPage(props: PageProps<"/plan">) {
  return (
    <>
      <PageHeader title="Events" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Agenda searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** Every upcoming night, of every kind together by date, each planned on its own page; then the ones that have happened */
async function Agenda({ searchParams }: { searchParams: PageProps<"/plan">["searchParams"] }) {
  const me = await requireUser();
  const shown = Math.max(PAST_STEP, Math.min(500, Number((await searchParams).past) || PAST_STEP));
  const [nights, past, members, polls, calledOff] = await Promise.all([getUpcomingNights(), getPastNights(shown), getMembers(), openPolls(), calledOffPolls()]);
  const colors = Object.fromEntries(members.map((m) => [m.id, m.color]));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  const pollViews: (PollView & { hasTitle: boolean })[] = polls.map((p) => ({
    id: p.id,
    title: pollTitle(p),
    hasTitle: Boolean(p.title),
    kindName: GROUP_NIGHTS.length > 1 ? NIGHT_NAMES[p.night] : null,
    location: p.location,
    url: p.posted ? p.url : null,
    usualTime: p.dates[0] ? nightWhen(p.dates[0].startsAt, TIME_ZONE).clock : "19:00",
    dates: p.dates.map((d) => {
      const when = nightWhen(d.startsAt, TIME_ZONE);
      return {
        id: d.id,
        startsAt: d.startsAt,
        label: when.label,
        time: when.time,
        past: d.past,
        voters: d.voters.map((v) => ({ playerId: v.playerId, name: v.name, userId: v.userId })),
        defaultTitle: nightTitle(p.night, localDate(new Date(d.startsAt))),
      };
    }),
  }));
  const pollSection = (
    <Section title="Picking a date" id="polls">
      {pollViews.length === 0 && <p className="mb-3 text-sm text-slate">Not sure when the next one is? Offer a few dates and see which work.</p>}
      {pollViews.length > 0 && (
        <div className="mb-4 space-y-3">
          {pollViews.map(({ hasTitle, ...p }) => (
            <PollCard key={p.id} poll={p} hasTitle={hasTitle} myPlayerId={me.playerId} colors={colors} />
          ))}
        </div>
      )}
      {calledOff.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {calledOff.map((p) => (
            <CalledOffPoll key={p.id} id={p.id} title={pollTitle(p)} />
          ))}
        </ul>
      )}
      <PollForm setup={{ nights: GROUP_NIGHTS, names: NIGHT_NAMES, discord: GROUP_NIGHTS.some(postsNights) }} />
    </Section>
  );

  return (
    <div className="space-y-12">
      <LiveRefresh />
      {pollViews.length > 0 && pollSection}
      <Section title="Coming up">
        {nights.length ? (
          <ul className="space-y-3">
            {nights.map((n) => (
              <li key={n.id}>
                <NightRow n={n} colors={colors} names={names} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {GROUP_NIGHTS.some(postsNights)
              ? `Nothing coming up. Add the next event below, or with /${commandName()} new in Discord.`
              : "Nothing coming up. Add the next event below."}
          </Empty>
        )}
        <div className="mt-4">
          <NightForm setup={{ nights: GROUP_NIGHTS, names: NIGHT_NAMES, discord: GROUP_NIGHTS.some(postsNights) }} />
        </div>
      </Section>

      {pollViews.length === 0 && pollSection}

      <Section title="Past events" id="past">
        {past.nights.length ? (
          <>
            <ul className="space-y-3">
              {past.nights.map((n) => (
                <li key={n.id}>
                  <NightRow n={n} colors={colors} names={names} />
                </li>
              ))}
            </ul>
            {past.more && (
              <Link href={`/plan?past=${shown + PAST_STEP}#past`} scroll={false} className={buttonClass("secondary", "mt-4")}>
                Show more
              </Link>
            )}
          </>
        ) : (
          <Empty>No events yet. Each one with plays logged shows up here.</Empty>
        )}
      </Section>
    </div>
  );
}
