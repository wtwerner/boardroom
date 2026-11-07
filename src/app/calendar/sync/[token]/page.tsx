import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { SITE_NAME, SITE_URL } from "@/config";
import { Panel, Skeleton } from "@/components/ui";
import { auth } from "@/lib/auth";
import { deviceFrom, googleSubscribeUrl, isSyncOrigin, webcalUrl } from "@/lib/calendar";
import { feedEvents, upcomingCount } from "@/lib/calendar-store";
import { loadSettings } from "@/lib/settings-store";
import { CopyLink } from "../../copy-link";
import { type BackLink, CalendarOption, CalendarShell } from "../../shared";

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
      <SyncCalendar params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Back to wherever they came here from. An event's page keeps this link, so it can offer it again signed out. */
function backFrom(from: unknown, token: string, signedIn: boolean): BackLink | null {
  if (from === "plan") return { href: "/plan", label: "All events" };
  if (isSyncOrigin(from)) return { href: `/calendar/${from}?sync=${token}`, label: "Back to event" };
  return signedIn ? { href: "/settings", label: "Settings" } : null;
}

async function SyncCalendar({ params, searchParams }: Pick<PageProps<"/calendar/sync/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const { from } = await searchParams;
  await connection();
  await loadSettings({ fresh: true });
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const events = await feedEvents(token);
  const shell = { siteName: SITE_NAME, back: backFrom(from, token, Boolean(session)), home: Boolean(session) };

  if (!events || !SITE_URL) {
    return (
      <CalendarShell {...shell} back={session ? shell.back : null}>
        <h1 className="font-display text-2xl leading-tight">This link has stopped working</h1>
        <p>It was replaced with a new one. Press Add to calendar on an event&apos;s post in Discord, or go to Settings on the site, to get your current link.</p>
      </CalendarShell>
    );
  }

  const feedUrl = `${SITE_URL}/api/calendar/feed/${token}.ics`;
  const android = deviceFrom(requestHeaders.get("user-agent")) === "android";
  const coming = upcomingCount(events);
  const subscribe = (
    <CalendarOption key="subscribe" href={webcalUrl(feedUrl)} primary={!android}>
      {!android && <RefreshCw className="size-4 shrink-0" />}
      {android ? "Another calendar app" : "Subscribe in Calendar"}
    </CalendarOption>
  );
  const google = (
    <CalendarOption key="google" href={googleSubscribeUrl(feedUrl)} web primary={android}>
      {android && <RefreshCw className="size-4 shrink-0" />}
      Google Calendar
    </CalendarOption>
  );

  return (
    <CalendarShell {...shell}>
      <header className="space-y-1">
        <h1 className="font-display text-2xl leading-tight">Sync my events</h1>
        <p className="text-slate">Your calendar shows every event you say Going or Maybe to, and updates when they move or get cancelled.</p>
      </header>

      <Panel className="space-y-3 p-4">
        <p className="text-sm font-medium">{coming ? `${coming} ${coming === 1 ? "event" : "events"} coming up right now.` : "Nothing yet. Say Going or Maybe to an event and it'll show up."}</p>
        <div className="space-y-2">{android ? [google, subscribe] : [subscribe, google]}</div>
        <p className="text-xs text-slate">Changes can take a few hours to show, or up to a day on Google.</p>
      </Panel>

      {/* Google's phone app can't subscribe by itself, so this is what most Android phones need */}
      <details open={android} className="rounded-xl border border-line bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Add it by hand</summary>
        <div className="mt-3 space-y-3">
          <CopyLink url={feedUrl} />
          <ul className="space-y-2 text-slate">
            <li>
              <strong className="font-medium text-ink">Google:</strong> in a browser, open calendar.google.com. Under Other calendars, choose From URL and paste the link. It then shows on your phone too.
            </li>
            <li>
              <strong className="font-medium text-ink">Outlook:</strong> choose Add calendar, then Subscribe from web, and paste the link.
            </li>
          </ul>
        </div>
      </details>

      <p className="text-xs text-slate">Keep this link to yourself: anyone with it can see when and where your events are. You can replace it from Settings on the site, or from Add to calendar on an event&apos;s post in Discord.</p>
    </CalendarShell>
  );
}
