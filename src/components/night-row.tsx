import Link from "next/link";
import clsx from "clsx";
import { CASUAL_NIGHT, NIGHT_NAMES, TIME_ZONE } from "@/config";
import type { MeepleColor, Night } from "@/db/enums";
import type { NightDetail } from "@/lib/events";
import { nightWhen } from "@/lib/nights";
import { Meeple, formatDate } from "./ui";

/** A calendar-page date, in the night's color */
export function DateBadge({ iso, night, size = "md" }: { iso: string; night: Night; size?: "md" | "lg" }) {
  const when = nightWhen(iso, TIME_ZONE);
  // A night from another year shows the year where the weekday goes
  const otherYear = when.year !== nightWhen(new Date().toISOString(), TIME_ZONE).year;
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center content-center rounded-lg border-t-4 bg-table text-center leading-none ring-1 ring-line",
        night === "casual" ? "border-night-casual" : "border-night-core",
        size === "lg" ? "size-18" : "size-14",
      )}
    >
      <span className="text-[0.65rem] font-semibold tracking-wider text-slate">{when.month}</span>
      <span className={clsx("font-display", size === "lg" ? "text-3xl" : "text-2xl")}>{when.day}</span>
      <span className="text-[0.65rem] text-slate">{otherYear ? when.year : when.weekday}</span>
    </span>
  );
}

/** Which kind of night, for a group that has two */
export function NightTag({ night, className }: { night: Night; className?: string }) {
  if (!CASUAL_NIGHT && night === "core") return null;
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 font-sans text-xs font-medium whitespace-nowrap text-ink",
        night === "casual" ? "bg-night-casual/20" : "bg-night-core/15",
        className,
      )}
    >
      {NIGHT_NAMES[night]}
    </span>
  );
}

/** Where a night's planning stands, in a line */
export function nightStatus(n: NightDetail, names: Record<string, string>) {
  if (n.night === "core") {
    const chosen = n.games.find((g) => g.chosen);
    const goingMembers = new Set(n.going.flatMap((a) => (a.userId ? [a.userId] : [])));
    if (chosen) {
      const prepped = chosen.readyUserIds.filter((id) => goingMembers.has(id)).length;
      return { text: `✓ ${chosen.game.name} · ${prepped}/${goingMembers.size} prepped`, done: true };
    }
    if (n.games.length === 0) return { text: "No game picked yet", done: false };
    const [top] = [...n.games].sort((a, b) => b.votes.length - a.votes.length);
    return {
      text: `${n.games.length} proposed · ${top.game.name} leads with ${top.votes.length} ${top.votes.length === 1 ? "vote" : "votes"}`,
      done: false,
    };
  }
  if (n.games.length === 0) return { text: "Nothing on the bring list yet", done: false };
  const bringers = [...new Set(n.games.flatMap((g) => (g.bringerId ? [names[g.bringerId] ?? "Someone"] : [])))];
  return { text: `${n.games.length} ${n.games.length === 1 ? "game" : "games"} coming${bringers.length ? ` from ${bringers.join(", ")}` : ""}`, done: true };
}

/** One night in the agenda: when, where, who's going, and where planning stands (or, once it's happened, who came and what was played) */
export function NightRow({ n, colors, names }: { n: NightDetail; colors: Record<string, MeepleColor | null>; names: Record<string, string> }) {
  if (n.past) return <PastRow n={n} />;
  const when = nightWhen(n.startsAt, TIME_ZONE);
  const status = nightStatus(n, names);
  const members = n.going.filter((a) => a.userId);
  const others = n.going.length - members.length + n.guests;
  return (
    <Link href={`/events/${n.id}`} className="flex items-start gap-4 rounded-xl border border-line bg-card p-3 hover:border-ink/40 hover:bg-felt-soft/40">
      <DateBadge iso={n.startsAt} night={n.night} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-lg leading-tight">{n.title}</span>
          <NightTag night={n.night} />
        </span>
        <span className="block text-sm text-slate">{[`${when.weekday} ${when.time}`, n.location].filter(Boolean).join(" · ")}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1" title={n.going.map((a) => a.name).join(", ")}>
            {members.map((a, i) => (
              <Meeple key={`${i}-${a.name}`} color={colors[a.userId!] ?? null} />
            ))}
            <span className="tabular ml-0.5">
              {n.going.length + n.guests}
              {n.capacity ? `/${n.capacity}` : ""} going
              {others > 0 && members.length > 0 ? ` (${others} ${others === 1 ? "guest" : "guests"})` : ""}
              {n.maybe.length > 0 && `, ${n.maybe.length} maybe`}
            </span>
          </span>
          <span className={clsx(status.done ? "font-medium text-ink" : "text-slate")}>{status.text}</span>
        </span>
      </span>
    </Link>
  );
}

function PastRow({ n }: { n: NightDetail }) {
  const when = nightWhen(n.startsAt, TIME_ZONE);
  const came = [...new Map(n.plays.flatMap((p) => p.players).map((s) => [s.playerId, s])).values()];
  const games = [...new Set(n.plays.map((p) => p.name))];
  return (
    <Link href={`/events/${n.id}`} className="flex items-start gap-4 rounded-xl border border-line bg-card p-3 hover:border-ink/40 hover:bg-felt-soft/40">
      <DateBadge iso={n.startsAt} night={n.night} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-lg leading-tight">{n.title}</span>
          <NightTag night={n.night} />
        </span>
        <span className="block text-sm text-slate">{[n.date ? formatDate(n.date) : when.label, n.location].filter(Boolean).join(" · ")}</span>
        {games.length ? (
          <span className="block text-sm font-medium">{games.join(", ")}</span>
        ) : (
          <span className="block text-sm text-slate">Nothing logged</span>
        )}
        {came.length > 0 && (
          <span className="flex items-center gap-1 text-sm" title={came.map((s) => s.name).join(", ")}>
            {came.map((s) => (
              <Meeple key={s.playerId} color={s.color} />
            ))}
            <span className="tabular ml-0.5 text-slate">{came.length} came</span>
          </span>
        )}
      </span>
    </Link>
  );
}
