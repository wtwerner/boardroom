import { NIGHT_NAMES, TIME_ZONE } from "@/config";
import type { Night } from "@/db/enums";
import type { Attendee } from "./rsvp";
import { titleCase } from "./text";

/**
 * The moment a wall-clock date and time happen in a time zone, for nights added by hand
 * ("2026-10-29", "19:00" in America/Chicago). Daylight saving is handled by checking the
 * zone's offset at the guess and again at the answer.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let at = wall - offsetMs(new Date(wall), timeZone);
  at = wall - offsetMs(new Date(at), timeZone);
  return new Date(at);
}

/** How far ahead of UTC the zone's clocks are at that moment */
function offsetMs(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}

/**
 * Who's at the table: members who are going (their opinions count in the picker), and
 * everyone else going as a count. Maybes aren't counted.
 */
export function tableFor(going: Attendee[], guests: number) {
  const memberIds = [...new Set(going.flatMap((a) => (a.userId ? [a.userId] : [])))];
  return { memberIds, others: going.filter((a) => !a.userId).length + guests };
}

/** A night's start as the group reads it: for date badges, labels, and the edit form's fields */
export function nightWhen(iso: string, timeZone: string) {
  const at = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) => at.toLocaleString("en-US", { timeZone, ...opts });
  return {
    month: part({ month: "short" }).toUpperCase(),
    day: part({ day: "numeric" }),
    weekday: part({ weekday: "short" }),
    year: part({ year: "numeric" }),
    time: part({ hour: "numeric", minute: "2-digit" }),
    /** "Thu, Oct 29" */
    label: part({ weekday: "short", month: "short", day: "numeric" }),
    date: at.toLocaleDateString("en-CA", { timeZone }),
    clock: part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  };
}

/** What a night made from logged plays is called, its date with the year: "10/18/26 Game Night" */
export function nightTitle(night: Night, date: string) {
  return `${shortDate(date)} ${titleCase(NIGHT_NAMES[night])}`;
}

/** "2026-10-18" as "10/18/26" */
function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}/${String(y % 100).padStart(2, "0")}`;
}

/** A timestamp as the group's calendar date (YYYY-MM-DD), ready for formatDate */
export function localDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** The `count` calendar months up to the one `today` (YYYY-MM-DD) is in, oldest first: "2025-11" … "2026-10" */
export function recentMonths(today: string, count = 12) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - count + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** "2025-11" as "Nov", or "Nov '25" with the year */
export function monthLabel(month: string, withYear = false) {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return withYear ? `${name} '${String(y % 100).padStart(2, "0")}` : name;
}
