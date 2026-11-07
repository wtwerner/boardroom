import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { openCalendarSync } from "@/app/actions";
import { SITE_NAME, TIME_ZONE } from "@/config";
import { Panel, Skeleton, buttonClass } from "@/components/ui";
import { auth } from "@/lib/auth";
import { deviceFrom, googleCalendarUrl, isFeedToken, outlookCalendarUrl } from "@/lib/calendar";
import { calendarEvent, nightFromKey, nightIsOver } from "@/lib/calendar-store";
import { discordAppUrl } from "@/lib/discord-components";
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
      <AddToCalendar params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AddToCalendar({ params, searchParams }: Pick<PageProps<"/calendar/[key]">, "params" | "searchParams">) {
  const { key } = await params;
  const { sync } = await searchParams;
  // Whether it's over depends on the time now, so this can't be prerendered
  await connection();
  await loadSettings({ fresh: true });
  const night = await nightFromKey(key);
  if (!night) notFound();

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const event = calendarEvent(night);
  const when = nightWhen(event.startsAt.toISOString(), TIME_ZONE);
  const closed = night.findingDate ? "This event doesn't have a date yet. Come back once it's set." : night.cancelled ? "This event was cancelled." : nightIsOver(night) ? "This event is over." : null;
  const device = deviceFrom(requestHeaders.get("user-agent"));
  // Signed out usually means Discord's own browser, which has no site session. Most of a casual
  // night's people have no account, so the site would only stop them at sign-in.
  const canOpenSite = Boolean(session) || night.night === "core";
  const back = !session && night.url ? { href: discordAppUrl(night.url) ?? night.url, label: "Back to Discord" } : canOpenSite ? { href: `/events/${night.id}`, label: "Back to event" } : null;

  return (
    <CalendarShell siteName={SITE_NAME} back={back} home={canOpenSite}>
      <header className="space-y-1">
        <h1 className="font-display text-2xl leading-tight">{event.title}</h1>
        {!night.findingDate && (
          <p className="text-slate">
            {when.label}, {when.time}
            {event.location && ` · ${event.location}`}
          </p>
        )}
      </header>

      {closed ? (
        <p>{closed}</p>
      ) : (
        <Panel className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">Just this event</h2>
            <p className="text-sm text-slate">Adds it once. It won&apos;t update if the event changes.</p>
          </div>
          <AddOptions icsUrl={`/api/calendar/night/${key}.ics`} googleUrl={googleCalendarUrl(event)} outlookUrl={outlookCalendarUrl(event)} apple={device === "apple"} android={device === "android"} />
        </Panel>
      )}

      <Panel className="space-y-3 p-4">
        <div>
          <h2 className="font-semibold">All your events</h2>
          <p className="text-sm text-slate">Every event you say Going or Maybe to, kept up to date when they move or get cancelled.</p>
        </div>
        {session ? (
          <form action={openCalendarSync}>
            <input type="hidden" name="from" value={key} />
            <button className={buttonClass("primary", "w-full")}>
              <RefreshCw className="size-4 shrink-0" /> Sync my events
            </button>
          </form>
        ) : isFeedToken(sync) ? (
          <a href={`/calendar/sync/${sync}?from=${key}`} className={buttonClass("primary", "w-full")}>
            <RefreshCw className="size-4 shrink-0" /> Sync my events
          </a>
        ) : (
          <p className="text-sm">{night.url ? "Say Going or Maybe on the event's post in Discord, then press Add to calendar there to get your link." : "Sign in to the site to get your link."}</p>
        )}
      </Panel>

      {!closed && !session && device !== "other" && <p className="text-center text-xs text-slate">Nothing opening? Open this page in your phone&apos;s browser.</p>}
    </CalendarShell>
  );
}

/** The likeliest calendar for their device first: the Calendar app on Apple's, or else Google's */
function AddOptions({ icsUrl, googleUrl, outlookUrl, apple, android }: { icsUrl: string; googleUrl: string; outlookUrl: string; apple: boolean; android: boolean }) {
  const google = (primary: boolean) => (
    <CalendarOption href={googleUrl} web primary={primary}>
      {primary && <CalendarPlus className="size-4 shrink-0" />}
      {primary ? "Google Calendar" : "Google"}
    </CalendarOption>
  );
  const outlook = (
    <CalendarOption href={outlookUrl} web>
      Outlook
    </CalendarOption>
  );
  return (
    <div className="space-y-2">
      {apple ? (
        <CalendarOption href={icsUrl} primary>
          <CalendarPlus className="size-4 shrink-0" />
          Add to Calendar
        </CalendarOption>
      ) : (
        google(true)
      )}
      <div className="grid grid-cols-2 gap-2">
        {apple ? google(false) : <CalendarOption href={icsUrl}>{android ? "Other app" : "Calendar file"}</CalendarOption>}
        {outlook}
      </div>
    </div>
  );
}
