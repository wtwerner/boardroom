import "server-only";
import { GROUP_NIGHTS, NIGHT_NAMES, TIME_ZONE } from "@/config";
import type { NightDetail } from "@/lib/events";
import { nightWhen, soonLabel } from "@/lib/nights";
import type { PollDetail } from "@/lib/poll-store";
import type { PollView } from "./polls";

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
    dates: poll.dates.map((d) => {
      const when = nightWhen(d.startsAt, TIME_ZONE);
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
      };
    }),
  };
}
