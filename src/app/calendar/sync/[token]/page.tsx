import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SITE_NAME, SITE_URL } from "@/config";
import { Skeleton } from "@/components/ui";
import { deviceFrom, googleSubscribeUrl, webcalUrl } from "@/lib/calendar";
import { feedEvents } from "@/lib/calendar-store";
import { loadSettings } from "@/lib/settings-store";
import { CopyLink } from "../../copy-link";
import { CalendarOption, CalendarShell } from "../../shared";

export const metadata: Metadata = { title: "Sync my events", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SyncCalendarPage(props: PageProps<"/calendar/sync/[token]">) {
  return (
    <Suspense
      fallback={
        <CalendarShell>
          <Skeleton className="h-64" />
        </CalendarShell>
      }
    >
      <SyncCalendar params={props.params} />
    </Suspense>
  );
}

async function SyncCalendar({ params }: { params: PageProps<"/calendar/sync/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  await loadSettings({ fresh: true });
  if (!SITE_URL || !(await feedEvents(token))) notFound();

  const feedUrl = `${SITE_URL}/api/calendar/feed/${token}.ics`;
  const device = deviceFrom((await headers()).get("user-agent"));
  const subscribe = (
    <CalendarOption key="subscribe" href={webcalUrl(feedUrl)} primary={device !== "android"}>
      {device === "android" ? "Another calendar app" : "Subscribe in Calendar"}
    </CalendarOption>
  );
  const google = (
    <CalendarOption key="google" href={googleSubscribeUrl(feedUrl)} primary={device === "android"}>
      Google Calendar
    </CalendarOption>
  );

  return (
    <CalendarShell siteName={SITE_NAME}>
      <header className="space-y-2">
        <h1 className="font-display text-3xl leading-tight">Sync my events</h1>
        <p>Your calendar will show every event you say Going or Maybe to, and follow moves and cancellations.</p>
        <p className="text-sm text-slate">Calendars check for changes on their own schedule, so an update can take several hours, or up to a day on Google.</p>
      </header>
      <div className="space-y-2">{device === "android" ? [google, subscribe] : [subscribe, google]}</div>
      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Google or Outlook won&apos;t add it?</h2>
        <p className="text-slate">
          Google&apos;s phone app can&apos;t subscribe by itself. In a browser, go to calendar.google.com, then Other calendars, then From URL, and paste this link. It shows up on your phone
          after that. In Outlook, use Add calendar, then Subscribe from web.
        </p>
        <CopyLink url={feedUrl} />
      </section>
      <p className="text-sm text-slate">
        This link is yours and shows where your events are, so keep it to yourself. If it gets out, you can make a new one from Add to calendar on an event&apos;s post in Discord, or on Settings on
        the site.
      </p>
    </CalendarShell>
  );
}
