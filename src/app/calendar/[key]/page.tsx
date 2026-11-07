import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { openCalendarSync } from "@/app/actions";
import { SITE_NAME, TIME_ZONE } from "@/config";
import { Skeleton, buttonClass } from "@/components/ui";
import { auth } from "@/lib/auth";
import { deviceFrom, googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";
import { calendarEvent, nightFromKey, nightIsOver } from "@/lib/calendar-store";
import { nightWhen } from "@/lib/nights";
import { loadSettings } from "@/lib/settings-store";
import { CalendarOption, CalendarShell } from "../shared";

export const metadata: Metadata = { title: "Add to calendar", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AddToCalendarPage(props: PageProps<"/calendar/[key]">) {
  return (
    <Suspense
      fallback={
        <CalendarShell>
          <Skeleton className="h-64" />
        </CalendarShell>
      }
    >
      <AddToCalendar params={props.params} />
    </Suspense>
  );
}

async function AddToCalendar({ params }: { params: PageProps<"/calendar/[key]">["params"] }) {
  const { key } = await params;
  // Whether it's over depends on the time now, so this can't be prerendered
  await connection();
  await loadSettings({ fresh: true });
  const night = await nightFromKey(key);
  if (!night) notFound();

  const requestHeaders = await headers();
  const event = calendarEvent(night);
  const when = nightWhen(event.startsAt.toISOString(), TIME_ZONE);
  const closed = night.findingDate ? "This event doesn't have a date yet. Come back once it's set." : night.cancelled ? "This event was cancelled." : nightIsOver(night) ? "This event is over." : null;
  const session = closed ? null : await auth.api.getSession({ headers: requestHeaders });

  return (
    <CalendarShell siteName={SITE_NAME}>
      <header className="space-y-1">
        <h1 className="font-display text-3xl leading-tight">{event.title}</h1>
        {!night.findingDate && (
          <p className="text-slate">
            {when.label}, {when.time}
            {event.location && ` · ${event.location}`}
          </p>
        )}
      </header>
      {closed ? <p>{closed}</p> : <AddOptions icsUrl={`/api/calendar/night/${key}.ics`} googleUrl={googleCalendarUrl(event)} outlookUrl={outlookCalendarUrl(event)} userAgent={requestHeaders.get("user-agent")} />}
      {!closed && <p className="text-sm text-slate">This adds it as it is now, so it won&apos;t follow any changes.</p>}
      {session && (
        <form action={openCalendarSync}>
          <button className={buttonClass("ghost", "w-full")}>Sync every event I&apos;m coming to instead</button>
        </form>
      )}
    </CalendarShell>
  );
}

function AddOptions({ icsUrl, googleUrl, outlookUrl, userAgent }: { icsUrl: string; googleUrl: string; outlookUrl: string; userAgent: string | null }) {
  const device = deviceFrom(userAgent);
  const ics = <CalendarOption key="ics" href={icsUrl} primary={device !== "android"}>{device === "apple" ? "Add to Calendar" : device === "android" ? "Another calendar app" : "Download a calendar file"}</CalendarOption>;
  const google = <CalendarOption key="google" href={googleUrl} primary={device === "android"}>Google Calendar</CalendarOption>;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {device === "android" ? [google, ics] : [ics, google]}
        <CalendarOption href={outlookUrl}>Outlook</CalendarOption>
      </div>
      {device === "apple" && <p className="text-sm text-slate">Add to Calendar lets you pick which of your phone&apos;s calendars it goes in.</p>}
      {device !== "other" && <p className="text-sm text-slate">Nothing happening? In Discord, open this page in your phone&apos;s browser and try again.</p>}
    </div>
  );
}
