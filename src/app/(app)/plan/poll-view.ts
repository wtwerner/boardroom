import "server-only";
import { GROUP_NIGHTS, NIGHT_NAMES, TIME_ZONE } from "@/config";
import type { Night } from "@/db/enums";
import { type NightDetail, getUpcomingNights } from "@/lib/events";
import { lastMadeNight } from "@/lib/night-store";
import { localDate, nightWhen, soonLabel } from "@/lib/nights";
import type { CalendarSetup } from "./date-picker";
import { NUDGE_EVERY_MS, type PollDetail } from "@/lib/poll-store";
import type { PollView } from "./polls";

/** What the calendar for picking dates needs: today in the group's time zone, and the days with an event already */
export async function calendarSetup(): Promise<CalendarSetup> {
  const nights = await getUpcomingNights();
  return { today: localDate(new Date()), taken: [...new Set(nights.flatMap((n) => (n.date ? [n.date] : [])))] };
}

/** The time each kind of night usually starts (HH:MM): the last one's, or 7pm */
export async function usualTimes(): Promise<Record<Night, string>> {
  const at = async (night: Night) => {
    const last = await lastMadeNight(night);
    return last ? nightWhen(last.startsAt.toISOString(), TIME_ZONE).clock : "19:00";
  };
  const [core, casual] = await Promise.all([at("core"), at("casual")]);
  return { core, casual };
}

/** A night finding its date as Plan and its page show it, with the dates written out in the group's time zone */
export function pollView(poll: PollDetail, n: NightDetail): PollView {
  const voter = (v: { playerId: number; name: string; userId: string | null }) => ({ playerId: v.playerId, name: v.name, userId: v.userId });
  return {
    id: poll.id,
    nightId: n.id,
    title: n.title,
    // Unnamed, it's named for its kind already
    kindName: GROUP_NIGHTS.length > 1 && n.named ? NIGHT_NAMES[n.night] : null,
    location: n.location,
    url: n.posted ? n.url : null,
    status: n.cancelled ? "cancelled" : poll.closed ? "closed" : "open",
    usualTime: nightWhen(n.startsAt, TIME_ZONE).clock,
    progress: poll.members.length ? { answered: poll.members.length - poll.waiting.length, of: poll.members.length, waiting: poll.waiting.map((m) => m.name) } : null,
    min: poll.min,
    // Nudged in its thread, so only once it's posted, and not again for a while
    decideBy: poll.decideBy ? nightWhen(poll.decideBy, TIME_ZONE).label : null,
    offeredDays: [...new Set(poll.dates.map((d) => localDate(new Date(d.startsAt))))],
    canNudge: n.posted && poll.waiting.length > 0 && (!poll.nudgedAt || Date.now() - Date.parse(poll.nudgedAt) >= NUDGE_EVERY_MS),
    dates: poll.dates.map((d) => {
      const when = nightWhen(d.startsAt, TIME_ZONE);
      const said = new Set([...d.yes, ...d.maybe, ...d.no].map((x) => x.playerId));
      return {
        id: d.id,
        startsAt: d.startsAt,
        label: when.label,
        time: when.time,
        soon: soonLabel(d.startsAt, TIME_ZONE),
        past: d.past,
        fellThrough: d.fellThrough,
        yes: d.yes.map(voter),
        maybe: d.maybe.map(voter),
        no: d.no.map((x) => ({ ...voter(x), assumed: x.assumed })),
        verdict: d.verdict,
        waiting: poll.members.filter((m) => m.playerId === null || !said.has(m.playerId)).map((m) => m.name),
      };
    }),
  };
}
