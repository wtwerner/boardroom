/**
 * Reads the date and time people type when they make or move a night in Discord: "thu",
 * "tomorrow", "10/29", "Oct 29", "2026-10-29", and "7pm", "7:30", "19:00". Pure and tested;
 * replies echo the result as a Discord timestamp so a misread is caught at once.
 */

import { zonedToUtc } from "./nights";

const DAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export type When = { date: string; time: string; startsAt: Date };

/**
 * The night's date (YYYY-MM-DD) and time (HH:MM) in the group's time zone, or a sentence
 * saying what couldn't be read. A weekday means the next one (today counts); a date without
 * a year that's already gone means next year's.
 */
export function parseWhen(dateText: string, timeText: string, now: Date, timeZone: string): When | { error: string } {
  const date = parseDate(dateText, now, timeZone);
  if (!date) return { error: `Couldn't read "${dateText}" as a date. Try thu, 10/29 or Oct 29.` };
  const time = parseTime(timeText);
  if (!time) return { error: `Couldn't read "${timeText}" as a time. Try 7pm or 19:00.` };
  return { date, time, startsAt: zonedToUtc(date, time, timeZone) };
}

export function parseDate(text: string, now: Date, timeZone: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const today = now.toLocaleDateString("en-CA", { timeZone });
  const [ty, tm, td] = today.split("-").map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (n: number) => iso(todayUtc + n * 86_400_000);

  if (t === "today" || t === "tonight") return today;
  if (t === "tomorrow" || t === "tmrw") return addDays(1);

  const weekday = t.match(/^(next )?([a-z]+)$/);
  const wd = weekday && dayIndex(weekday[2]);
  if (weekday && wd !== null) {
    const ahead = (wd - new Date(todayUtc).getUTCDay() + 7) % 7;
    return addDays(ahead === 0 && weekday[1] ? 7 : ahead);
  }

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);

  // "Thu Oct 29" reads the same as "Oct 29": the weekday is only there to help people
  const rest = t.replace(/^([a-z]+) (?=[a-z]+ \d|\d)/, (w, day) => (dayIndex(day) !== null ? "" : w));

  m = rest.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) return withYear(+m[1], +m[2], m[3]);
  m = rest.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (m && monthIndex(m[1]) !== null) return withYear(monthIndex(m[1])! + 1, +m[2], m[3]);
  m = rest.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/);
  if (m && monthIndex(m[2]) !== null) return withYear(monthIndex(m[2])! + 1, +m[1], m[3]);
  return null;

  function withYear(month: number, day: number, year?: string) {
    if (year) return validDate(year.length === 2 ? 2000 + Number(year) : Number(year), month, day);
    const thisYear = validDate(ty, month, day);
    return thisYear && thisYear < today ? validDate(ty + 1, month, day) : thisYear;
  }
}

/** "7pm", "7:30 p.m.", "19:00", "noon". An hour from 1 to 11 with no am or pm is the evening. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (t === "noon") return "12:00";
  if (t === "midnight") return "00:00";
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const meridiem = m[3]?.[0];
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === "p" ? 12 : 0);
  } else {
    if (h > 23) return null;
    if (h >= 1 && h <= 11 && !m[1].startsWith("0")) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function dayIndex(word: string) {
  return DAYS[word] ?? null;
}

/** "oct", "octo" and "october" all work; "ma" is too short to tell */
function monthIndex(word: string) {
  const i = word.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(word)) : -1;
  return i >= 0 ? i : null;
}

function validDate(y: number, m: number, d: number) {
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return at.toISOString().slice(0, 10);
}

/** A date and time as the form shows them to edit: "Thu Oct 29" and "7:00 pm" */
export function formatForForm(startsAt: Date, timeZone: string) {
  const part = (opts: Intl.DateTimeFormatOptions) => startsAt.toLocaleString("en-US", { timeZone, ...opts });
  return {
    date: `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })}`,
    time: part({ hour: "numeric", minute: "2-digit" }).toLowerCase(),
  };
}

/** A time at the end of a date ("sat 2pm", "11/7 at 6", "fri 19:30"). A bare number needs "at", so "Oct 7" stays a date. */
const TRAILING_TIME = /\s+(?:(?:at|@)\s*)?(noon|midnight|\d{1,2}(?::\d{2})?\s*[ap]\.?m?\.?|\d{1,2}:\d{2})$/i;
const AT_HOUR = /\s+(?:at|@)\s*(\d{1,2})$/i;

/**
 * The dates someone offers for a poll, one per line or separated by commas: "thu", "sat 2pm",
 * "11/7 at 6". A date without its own time takes `defaultTime`. Soonest first, without repeats,
 * or a sentence saying which one couldn't be read or has gone by.
 */
export function parseDateList(text: string, defaultTime: string, now: Date, timeZone: string, max: number): When[] | { error: string } {
  // One per line; on a single line, commas split them, but a year after a comma stays with its date ("Oct 29, 2026")
  const pieces = (/\n/.test(text.trim()) ? text.split(/[\n;]+/) : text.split(/[,;]+/)).map((p) => p.trim()).filter(Boolean);
  const entries: string[] = [];
  for (const p of pieces) {
    if (/^\d{4}$/.test(p) && entries.length) entries[entries.length - 1] += ` ${p}`;
    else entries.push(p);
  }
  if (!entries.length) return { error: "Give a date or two to pick from." };

  const found = new Map<number, When>();
  for (const entry of entries) {
    const timed = entry.match(TRAILING_TIME) ?? entry.match(AT_HOUR);
    const dateText = timed ? entry.slice(0, timed.index).trim() : entry;
    const when = parseWhen(dateText, timed?.[1] ?? defaultTime, now, timeZone);
    if ("error" in when) return when;
    if (when.startsAt.getTime() < now.getTime()) return { error: `"${entry}" has already gone by. Pick dates that are coming up.` };
    found.set(when.startsAt.getTime(), when);
  }
  if (found.size > max) return { error: `That's ${found.size} dates; a poll fits ${max}.` };
  return [...found.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
