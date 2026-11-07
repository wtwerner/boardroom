/**
 * Nights in people's own calendars: the iCalendar text behind a one-off .ics file and a subscribed
 * feed, the links that open Google's and Outlook's add-an-event screens, the signed key that lets
 * someone without an account open a night's calendar page, and which option suits their device.
 * Pure so it can be tested; calendar-store.ts reads the nights and the secrets.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type CalendarEvent = {
  id: number;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  /** Where to plan it: shown in the event's notes */
  url: string | null;
  cancelled: boolean;
  updatedAt: Date;
};

/** Text in an iCalendar value: its commas, semicolons, backslashes and line breaks are escaped */
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A moment in UTC: 20261029T190000Z. Calendars show it in the reader's own time zone. */
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines stop at 75 bytes and carry on after a line break and a space, never mid-character */
function fold(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

/** Where it says to go to plan the night, in its notes */
const notes = (e: CalendarEvent) => (e.url ? `Plan it: ${e.url}` : null);

function eventLines(e: CalendarEvent, host: string) {
  const description = notes(e);
  return [
    "BEGIN:VEVENT",
    // The same night keeps the same id, so a change updates it rather than adding another
    `UID:night-${e.id}@${host}`,
    `DTSTAMP:${utcStamp(e.updatedAt)}`,
    `LAST-MODIFIED:${utcStamp(e.updatedAt)}`,
    `DTSTART:${utcStamp(e.startsAt)}`,
    `DTEND:${utcStamp(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

/** An iCalendar file. `feedName` makes it a feed: what the calendar is called, and how often to look for changes. */
export function buildCalendar(events: CalendarEvent[], { host, feedName }: { host: string; feedName?: string }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Boardroom//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(feedName ? [`NAME:${escapeText(feedName)}`, `X-WR-CALNAME:${escapeText(feedName)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"] : []),
    ...events.flatMap((e) => eventLines(e, host)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Google Calendar's screen for adding this event */
export function googleCalendarUrl(e: CalendarEvent) {
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${utcStamp(e.startsAt)}/${utcStamp(e.endsAt)}` });
  if (e.location) params.set("location", e.location);
  const description = notes(e);
  if (description) params.set("details", description);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Outlook's screen for adding this event */
export function outlookCalendarUrl(e: CalendarEvent) {
  const params = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: e.startsAt.toISOString(), enddt: e.endsAt.toISOString() });
  if (e.location) params.set("location", e.location);
  const description = notes(e);
  if (description) params.set("body", description);
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}

/** Subscribing: calendar apps take webcal:// for the same address as the feed's https:// */
export const webcalUrl = (feedUrl: string) => feedUrl.replace(/^https?:\/\//, "webcal://");

/** Google's screen for adding a calendar by its address */
export const googleSubscribeUrl = (feedUrl: string) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;

const signature = (nightId: number, secret: string) => createHmac("sha256", secret).update(`calendar-night:${nightId}`).digest("base64url").slice(0, 22);

/** What's in the address of a night's calendar page: its id, signed so nobody can step through the others */
export const signNightKey = (nightId: number, secret: string) => `${nightId}-${signature(nightId, secret)}`;

/** The night a key is for, or null when it isn't one we signed */
export function readNightKey(key: string, secret: string): number | null {
  const match = /^(\d{1,15})-([\w-]{22})$/.exec(key);
  if (!match) return null;
  const nightId = Number(match[1]);
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(signature(nightId, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? nightId : null;
}

/** Looks like a feed's secret: 24 random bytes, base64url. Whether it's anyone's is for the feed to say. */
export const isFeedToken = (s: unknown): s is string => typeof s === "string" && /^[\w-]{32}$/.test(s);

/** Where someone came to the sync page from: Plan, or a night's calendar page by its key */
export const isSyncOrigin = (s: unknown): s is string => typeof s === "string" && /^(plan|\d{1,15}-[\w-]{22})$/.test(s);

export type CalendarDevice = "apple" | "android" | "other";

/** Which calendars to offer first. The web can't see someone's default calendar app, so this goes by their phone. */
export function deviceFrom(userAgent: string | null): CalendarDevice {
  if (!userAgent) return "other";
  if (/android/i.test(userAgent)) return "android";
  return /iphone|ipad|ipod|macintosh/i.test(userAgent) ? "apple" : "other";
}
