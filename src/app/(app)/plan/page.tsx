import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { GROUP_NIGHTS, NIGHT_NAMES } from "@/config";
import { Empty, PageHeader, Section, Skeleton, buttonClass } from "@/components/ui";
import { NightRow } from "@/components/night-row";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/session";
import { getMembers } from "@/lib/queries";
import { commandName, postsNights } from "@/lib/discord";
import { getPastNights, getUpcomingNights } from "@/lib/events";
import { NightForm } from "../events/night-form";

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
  await requireUser();
  const shown = Math.max(PAST_STEP, Math.min(500, Number((await searchParams).past) || PAST_STEP));
  const [nights, past, members] = await Promise.all([getUpcomingNights(), getPastNights(shown), getMembers()]);
  const colors = Object.fromEntries(members.map((m) => [m.id, m.color]));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));

  return (
    <div className="space-y-12">
      <LiveRefresh />
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
