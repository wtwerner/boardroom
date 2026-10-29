/**
 * A poll's post in its kind of night's events channel, as a Components V2 message: each date
 * offered (in each reader's own time zone) with who it works for and a button to say it works
 * for you, then buttons to suggest another, pick one, or call it off (and reopen it). Picking a date turns the
 * post into the night's (night-message.ts). Pure so it can be tested; poll-post.ts sends it.
 */

import type { Night, PollStatus } from "@/db/enums";
import { type AppEmoji, buttonEmoji, icon } from "./icons";
import { type Action, actionId } from "./interactions";
import { type CardPerson, type NightPing, person } from "./night-message";
import { ACTION_ROW, BUTTON, COMPONENTS_V2, CONTAINER, type Component, LINK_BUTTON_STYLE, NIGHT_ACCENT, SECONDARY, SECTION, SEPARATOR, TEXT, escape } from "./discord-components";

/** Grey for a poll that's over without a date */
const DONE_ACCENT = 0x8a8f98;

export type PollDate = { id: number; /** ISO timestamp */ startsAt: string; past: boolean; voters: CardPerson[] };

export type PollCard = {
  id: number;
  title: string;
  location: string | null;
  /** Never "picked": by then the post is the night's */
  status: Exclude<PollStatus, "picked">;
  kind: Night;
  /** What the kind of night is called, when the group has more than one kind */
  kindName: string | null;
  dates: PollDate[];
  /** Plan on the site, where the poll can be answered too */
  pollUrl: string | null;
  siteName: string;
  emoji?: AppEmoji;
};

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export function buildPollMessage(p: PollCard, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const open = p.status === "open";
  const title = p.status === "cancelled" ? `## ~~${escape(p.title)}~~\n${icon(e, "cancelled")} **Called off**` : `## ${escape(p.title)}`;
  const sub = ["Picking a date", p.kindName && escape(p.kindName)].filter(Boolean).join(" · ");
  const intro = [
    p.location && `${icon(e, "place")} ${escape(p.location)}`,
    open && "Tap **Works for me** on every date you could make.",
    p.status === "closed" && "-# Every date has gone by.",
  ].filter(Boolean);

  const card: Component[] = [
    { type: TEXT, content: `${title}\n-# ${sub}` },
    ...(intro.length ? [{ type: TEXT, content: intro.join("\n") }] : []),
    { type: SEPARATOR, divider: true, spacing: 2 },
    ...p.dates.map((d) => dateRow(d, open, e)),
  ];

  const row = pollRow(p, e);
  return {
    flags: COMPONENTS_V2,
    components: [
      // Above the card, on the first post only: edits drop it, and never ping
      ...(ping ? [{ type: TEXT, content: ping.text }] : []),
      { type: CONTAINER, accent_color: open ? NIGHT_ACCENT[p.kind] : DONE_ACCENT, components: card },
      ...(row.length ? [{ type: ACTION_ROW, components: row }] : []),
    ],
  };
}

/**
 * The copy of the post in its thread, where its buttons work (night-post.ts): Discord already
 * shows the post at the top of the thread, so the copy is only each date still to come with how
 * many it works for, and the buttons, and doesn't read as the post twice
 */
export function buildPollThreadCopy(p: PollCard): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const row = pollRow(p, e);
  const dates =
    p.status === "open"
      ? p.dates
          .filter((d) => !d.past)
          .map((d) => ({
            type: SECTION,
            components: [{ type: TEXT, content: `${icon(e, "date")} <t:${unix(d.startsAt)}:F> · ${d.voters.length}` }],
            accessory: button({ kind: "pollVote", optionId: d.id }, "Works for me", buttonEmoji(e, "going")),
          }))
      : [{ type: TEXT, content: p.status === "cancelled" ? `-# ${icon(e, "cancelled")} Called off` : "-# Every date has gone by" }];
  return { flags: COMPONENTS_V2, components: [...dates, ...(row.length ? [{ type: ACTION_ROW, components: row }] : [])] };
}

/** The buttons under the dates: suggest, pick or call off while it's open; reopen once it's called off */
function pollRow(p: PollCard, e: AppEmoji): Component[] {
  if (p.status === "open") {
    return [
      button({ kind: "pollAdd", pollId: p.id }, "Suggest a date", buttonEmoji(e, "edit")),
      button({ kind: "pollPick", pollId: p.id }, "Pick the date", buttonEmoji(e, "date")),
      button({ kind: "pollOff", pollId: p.id }, "Call it off", buttonEmoji(e, "cancelled")),
      ...(p.pollUrl ? [{ type: BUTTON, style: LINK_BUTTON_STYLE, label: `Open in ${p.siteName}`.slice(0, 80), url: p.pollUrl }] : []),
    ];
  }
  // Called off by mistake, or plans changed back: it can open again while a date's still coming up
  return p.status === "cancelled" && p.dates.some((d) => !d.past) ? [button({ kind: "pollReopen", pollId: p.id }, "Reopen", buttonEmoji(e, "vote"))] : [];
}

/** One date: when, how many it works for and who, with the button beside it while it can still be picked */
function dateRow(d: PollDate, open: boolean, e: AppEmoji): Component {
  const at = `<t:${unix(d.startsAt)}:F>`;
  if (d.past) return { type: TEXT, content: `${icon(e, "date")} ~~${at}~~ · gone by` };
  const who = d.voters.length ? `> ${d.voters.map(person).join(", ")}` : "-# Nobody yet";
  const content = `${icon(e, "date")} **${at}** · ${d.voters.length}\n${who}`;
  if (!open) return { type: TEXT, content };
  return {
    type: SECTION,
    components: [{ type: TEXT, content }],
    accessory: button({ kind: "pollVote", optionId: d.id }, "Works for me", buttonEmoji(e, "going")),
  };
}

function button(action: Action, label: string, emoji: { id?: string; name: string }): Component {
  return { type: BUTTON, style: SECONDARY, label, custom_id: actionId(action), emoji };
}

/** The poll's thread, until a date is picked and it's renamed for the night */
export const pollThreadName = (title: string) => `Picking a date · ${title}`.slice(0, 100);

/** The dates that can still be picked, the most votes first, then the soonest */
export function rankDates<T extends Pick<PollDate, "startsAt" | "past"> & { voters: unknown[] }>(dates: T[]): T[] {
  return dates.filter((d) => !d.past).sort((a, b) => b.voters.length - a.voters.length || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/**
 * A date as the Pick the date list shows it, in the group's time zone (a list can't show each
 * reader their own): "Thu, Nov 5, 7:00 PM · 3 can make it"
 */
export function dateChoiceLabel(startsAt: string, votes: number, timeZone: string) {
  const at = new Date(startsAt).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${at} · ${votes ? `${votes} can make it` : "nobody yet"}`;
}

/** "a", "a and b", "a, b and c" */
const andList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * What the Find a new date form in Discord says about the poll's other dates, in its 100
 * characters: "Sun Nov 8 and Sun Nov 15 stay on the poll, with their votes. Add more, or none."
 */
export function stayingLine(dates: string[], timeZone: string) {
  if (!dates.length) return "A date or two to offer instead of this one.";
  const day = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).replaceAll(",", "");
  const names = dates.map(day);
  const line = `${andList(names)} ${names.length === 1 ? "stays on the poll, with its votes" : "stay on the poll, with their votes"}. Add more, or none.`;
  return line.length <= 100 ? line : `Its ${names.length} other dates stay on the poll, with their votes. Add more, or none.`;
}

/** "The 2 games proposed for it come", or on a casual night "The game someone's bringing comes" */
function gamesComing(count: number, night: Night) {
  if (night === "casual") return count === 1 ? "The game someone's bringing comes" : `The ${count} games people are bringing come`;
  return count === 1 ? "The game proposed for it comes" : `The ${count} games proposed for it come`;
}

/**
 * The note in the thread when a night goes back to finding a date: who did it and which date
 * fell through, a ping for whoever was going to say which dates work now, and that its games
 * (proposed, or being brought to a casual night) come back with the next pick.
 */
export function refindMessage(n: { by: string; was: string; going: CardPerson[]; games: number; night: Night }) {
  const going = n.going.filter((g) => g.discordId);
  const lines = [
    `↩️ ${n.by} moved this back to finding a date: <t:${unix(n.was)}:F> didn't work out.`,
    ...(going.length ? [`${andList(going.map(person))}, you were going. Say which dates work for you on the post.`] : []),
    ...(n.games ? [`${gamesComing(n.games, n.night)} back once a date's picked.`] : []),
  ];
  return { body: { content: lines.join("\n") }, allowedMentions: { parse: [], users: [...new Set(going.map((g) => g.discordId!))] } };
}

/**
 * The reply on the post once a date is picked: pings whoever the group set for its nights, and
 * the people that date works for, saying they're down as going (nothing for them to do), and
 * asks everyone else to say whether they're coming.
 */
export function pickedMessage(p: { title: string; startsAt: string; voters: CardPerson[] }, ping: NightPing | null) {
  const voters = p.voters.filter((v) => v.discordId);
  const lines = [
    `${ping ? `${ping.text} ` : ""}**${escape(p.title)}** is set for <t:${unix(p.startsAt)}:F> (<t:${unix(p.startsAt)}:R>).`,
    voters.length
      ? `${andList(voters.map(person))} ${voters.length === 1 ? "is" : "are"} down as going, since that date works for them. Anyone else, say on the post if you're coming.`
      : "Say if you're coming on the post.",
  ];
  return {
    body: { content: lines.join("\n") },
    allowedMentions: {
      parse: ping?.allowedMentions.parse ?? [],
      ...(ping?.allowedMentions.roles ? { roles: ping.allowedMentions.roles } : {}),
      users: [...new Set(voters.map((v) => v.discordId!))],
    },
  };
}
