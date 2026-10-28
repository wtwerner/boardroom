/**
 * The two nudges around a night Boardroom runs: a reminder in its channel a few hours before it
 * starts, pinging whoever's going or a maybe, and a DM the morning after asking whoever made it
 * to log what was played. When each is due and what it says; pure, so it's tested. nudge-post.ts
 * sends them.
 */

import { escape } from "./discord-components";

const HOUR = 3_600_000;
/** A night's page turns into what was played (with the form to log it) this long after it starts */
const PAST_AFTER_MS = 12 * HOUR;
/** The morning-after DM goes between these hours in the group's time zone, so it never wakes anyone */
const NUDGE_FROM_HOUR = 10;
const NUDGE_UNTIL_HOUR = 21;
/** Nights longer ago than this aren't nudged about, so turning this on doesn't DM about last month */
const NUDGE_WITHIN_MS = 3 * 24 * HOUR;

export type NudgeNight = { startsAt: Date; date: string | null; createdAt: Date; cancelled: boolean };

/**
 * Whether a night's reminder is due: it starts within `hours`, and it was made before then
 * (a night made an hour before it starts doesn't need reminding about).
 */
export function reminderDue(n: NudgeNight, now: Date, hours: number) {
  if (hours <= 0 || n.cancelled) return false;
  const from = n.startsAt.getTime() - hours * HOUR;
  return now.getTime() >= from && now < n.startsAt && n.createdAt.getTime() < from;
}

/**
 * Whether to ask for a night's plays now: the morning after (in the group's time zone) or
 * later, once its page shows the log form, and not long ago. Whether anything's been logged
 * is the caller's to check.
 */
export function logNudgeDue(n: NudgeNight, now: Date, timeZone: string) {
  if (n.cancelled || !n.date) return false;
  const since = now.getTime() - n.startsAt.getTime();
  if (since < PAST_AFTER_MS || since > NUDGE_WITHIN_MS) return false;
  const today = now.toLocaleDateString("en-CA", { timeZone });
  const hour = Number(now.toLocaleString("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }));
  return today > n.date && hour >= NUDGE_FROM_HOUR && hour < NUDGE_UNTIL_HOUR;
}

export type ReminderPerson = { name: string; discordId: string | null };
/** A game someone said they'd bring, one per game */
export type ReminderBring = ReminderPerson & { game: string };

const mention = (p: ReminderPerson) => (p.discordId ? `<@${p.discordId}>` : escape(p.name));

/**
 * "⏰ Thursday heavy starts in 3 hours", reminding whoever said they'd bring a game which ones,
 * and pinging everyone else going or a maybe who's in Discord
 */
export function reminderMessage(n: { title: string; startsAt: Date; location: string | null; people: ReminderPerson[]; bringing?: ReminderBring[] }) {
  const unix = Math.floor(n.startsAt.getTime() / 1000);
  // A line part per person bringing, their games together
  const byBringer = new Map<string, { who: ReminderPerson; games: string[] }>();
  for (const b of n.bringing ?? []) {
    const key = b.discordId ?? b.name;
    const theirs = byBringer.get(key);
    if (theirs) theirs.games.push(b.game);
    else byBringer.set(key, { who: b, games: [b.game] });
  }
  const bringers = [...byBringer.values()];
  const bringerIds = new Set(bringers.flatMap((b) => (b.who.discordId ? [b.who.discordId] : [])));
  const others = [...new Set(n.people.flatMap((p) => (p.discordId && !bringerIds.has(p.discordId) ? [p.discordId] : [])))];
  const lines = [
    `⏰ **${escape(n.title)}** starts <t:${unix}:R>, at <t:${unix}:t>${n.location ? ` · 📍 ${escape(n.location)}` : ""}`,
    bringers.length && `🎲 Don't forget your games: ${bringers.map((b) => `${mention(b.who)} ${b.games.map((g) => `**${escape(g)}**`).join(", ")}`).join(" · ")}`,
    others.map((id) => `<@${id}>`).join(" "),
  ];
  return {
    body: { content: lines.filter(Boolean).join("\n") },
    allowedMentions: { parse: [] as [], users: [...bringerIds, ...others] },
  };
}

/** The DM to whoever made a night, once it's over and nothing's been logged for it */
export function logNudgeDm(n: { title: string; url: string | null; siteName: string }) {
  const how = "Who said they were going is filled in: tick the games you played and add any that weren't on the list.";
  return {
    content: [
      `How did **${escape(n.title)}** go? Nothing's logged for it yet.`,
      n.url ? `[Log what you played](<${n.url}>). ${how}` : `Log what you played on its page in ${escape(n.siteName)}. ${how}`,
    ].join("\n"),
  };
}
