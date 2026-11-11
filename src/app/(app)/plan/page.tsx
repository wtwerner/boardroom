import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { openCalendarSync } from "@/app/actions";
import { GROUP_NIGHTS, NIGHT_NAMES, NIGHT_TITLES } from "@/config";
import type { Night } from "@/db/enums";
import { Empty, PageHeader, Section, Skeleton, buttonClass } from "@/components/ui";
import { NightRow, isOn } from "@/components/night-row";
import { LiveRefresh } from "@/components/live-refresh";
import { nightsFor, requireUser, seesNight } from "@/lib/session";
import { getMembers } from "@/lib/queries";
import { commandName, postsNights } from "@/lib/discord";
import { getPastNights, getUpcomingNights, loadNight } from "@/lib/events";
import { NightForm } from "../events/night-form";
import { findingPolls } from "@/lib/poll-store";
import { CalledOffPoll, PollCard, PollForm } from "./polls";
import { calendarSetup, pollView, usualTimes } from "./poll-view";

export const metadata: Metadata = { title: "Plan" };

/** Past nights shown at first, and how many more each "Show more" adds */
const PAST_STEP = 10;

export default function PlanPage(props: PageProps<"/plan">) {
  return (
    <>
      <PageHeader title="Events">
        <form action={openCalendarSync}>
          <input type="hidden" name="from" value="plan" />
          <button className={buttonClass("secondary")}>
            <RefreshCw className="size-4 shrink-0" /> Sync my events
          </button>
        </form>
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Agenda searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/**
 * Every upcoming night of the kinds someone sees, together by date, each planned on its own page;
 * then the ones that have happened. Making events, and reopening one called off, are the members'.
 */
async function Agenda({ searchParams }: { searchParams: PageProps<"/plan">["searchParams"] }) {
  const me = await requireUser();
  const member = me.access === "member";
  const mine = <T extends { night: Night }>(rows: T[]) => rows.filter((r) => seesNight(me, r.night));
  const shown = Math.max(PAST_STEP, Math.min(500, Number((await searchParams).past) || PAST_STEP));
  const [nights, past, members, polls, calledOff, calendar, times] = await Promise.all([
    getUpcomingNights().then(mine),
    getPastNights(shown).then((p) => ({ ...p, nights: mine(p.nights) })),
    getMembers(member ? "core" : "casual"),
    findingPolls().then(mine),
    member ? findingPolls({ cancelled: true }) : [],
    calendarSetup(),
    usualTimes(),
  ]);
  const setup = { nights: nightsFor(me), names: NIGHT_NAMES, titles: NIGHT_TITLES, discord: nightsFor(me).some(postsNights) };
  const colors = Object.fromEntries(members.map((m) => [m.id, m.color]));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  // Nights still finding their date, each with the dates on offer
  const finding = await Promise.all(polls.map(async (p) => ({ poll: p, night: await loadNight(p.nightId) })));
  const pollViews = finding.flatMap(({ poll, night }) => (night ? [pollView(poll, night)] : []));
  const offNights = await Promise.all(calledOff.map((p) => loadNight(p.nightId)));
  const pollSection = (
    <Section title="Picking a date" id="polls">
      {pollViews.length === 0 && member && <p className="mb-3 text-sm text-slate">Not sure when the next one is? Offer a few dates and see which work.</p>}
      {pollViews.length > 0 && (
        <div className="mb-4 space-y-3">
          {pollViews.map((p) => (
            <PollCard key={p.id} poll={p} myPlayerId={me.playerId} colors={colors} calendar={calendar} link limited={!member} />
          ))}
        </div>
      )}
      {calledOff.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {calledOff.map((p, i) => (
            <CalledOffPoll key={p.id} id={p.id} nightId={p.nightId} title={offNights[i]?.title ?? NIGHT_NAMES[p.night]} />
          ))}
        </ul>
      )}
      {member && <PollForm setup={setup} calendar={calendar} times={times} />}
    </Section>
  );

  // A night that's on goes first, above the polls and what's coming up
  const on = nights.filter(isOn);
  const upcoming = nights.filter((n) => !isOn(n));

  return (
    <div className="space-y-12">
      <LiveRefresh />
      {on.length > 0 && (
        <Section title="Happening now">
          <ul className="space-y-3">
            {on.map((n) => (
              <li key={n.id}>
                <NightRow n={n} colors={colors} names={names} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {pollViews.length > 0 && pollSection}
      <Section title="Coming up">
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((n) => (
              <li key={n.id}>
                <NightRow n={n} colors={colors} names={names} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {!member
              ? "Nothing coming up yet. The next one shows up here, and in Discord, once it's planned."
              : GROUP_NIGHTS.some(postsNights)
                ? `Nothing coming up. Add the next event below, or with /${commandName()} new in Discord.`
                : "Nothing coming up. Add the next event below."}
          </Empty>
        )}
        {member && (
          <div className="mt-4">
            <NightForm setup={setup} />
          </div>
        )}
      </Section>

      {pollViews.length === 0 && member && pollSection}

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
