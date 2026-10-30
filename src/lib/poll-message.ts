/**
 * The post of a night that's finding its date, as a Components V2 message: each date on offer
 * (in each reader's own time zone) with who can come and a button to say it works, then buttons
 * to suggest another, set one, say none work, or call it off (and reopen it). Once its date's
 * set, the same post is the night's card (night-message.ts). Pure so it can be tested;
 * night-post.ts sends it.
 */

import type { Night } from "@/db/enums";
import { type AppEmoji, buttonEmoji, icon } from "./icons";
import { type Action, actionId } from "./interactions";
import { type CardPerson, type NightPing, person } from "./night-message";
import { andList } from "./text";
import { ACTION_ROW, BUTTON, COMPONENTS_V2, CONTAINER, type Component, LINK_BUTTON_STYLE, NIGHT_ACCENT, SECONDARY, SECTION, SEPARATOR, TEXT, escape } from "./discord-components";

/** Grey for a night called off before it had a date */
const DONE_ACCENT = 0x8a8f98;

export type PollDate = {
  id: number;
  /** ISO timestamp */
  startsAt: string;
  past: boolean;
  /** It was set, then fell through */
  fellThrough?: boolean;
  /** It works for them */
  yes: CardPerson[];
  /** It works if they have to */
  maybe: CardPerson[];
};

export type PollCard = {
  /** The poll's id, which its buttons carry */
  id: number;
  title: string;
  location: string | null;
  /** Called off, or every date went by without one being set */
  status: "open" | "cancelled" | "closed";
  kind: Night;
  /** What the kind of night is called, when the group has more than one kind */
  kindName: string | null;
  dates: PollDate[];
  /** The night's page, where the dates can be answered too */
  pollUrl: string | null;
  siteName: string;
  emoji?: AppEmoji;
};

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const onOffer = (d: PollDate) => !d.past && !d.fellThrough;

export function buildPollMessage(p: PollCard, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const open = p.status === "open";
  const title = p.status === "cancelled" ? `## ~~${escape(p.title)}~~\n${icon(e, "cancelled")} **Called off**` : `## ${escape(p.title)}`;
  const sub = ["Date TBD", p.kindName && escape(p.kindName)].filter(Boolean).join(" · ");
  const intro = [
    p.location && `${icon(e, "place")} ${escape(p.location)}`,
    open && "Tap **Works for me** on each date you could make. The rest count as can't.",
    p.status === "closed" && "-# Every date's gone by. Suggest another, or call it off.",
  ].filter(Boolean);
  const done = doneLines(p.dates);

  const card: Component[] = [
    { type: TEXT, content: `${title}\n-# ${sub}` },
    ...(intro.length ? [{ type: TEXT, content: intro.join("\n") }] : []),
    { type: SEPARATOR, divider: true, spacing: 2 },
    ...p.dates.filter(onOffer).map((d) => dateRow(d, open, e)),
    ...(done ? [{ type: TEXT, content: done }] : []),
  ];

  const row = pollRow(p, e);
  return {
    flags: COMPONENTS_V2,
    components: [
      // Above the card, on the first post only: edits drop it, and never ping
      ...(ping ? [{ type: TEXT, content: ping.text }] : []),
      { type: CONTAINER, accent_color: open || p.status === "closed" ? NIGHT_ACCENT[p.kind] : DONE_ACCENT, components: card },
      ...(row.length ? [{ type: ACTION_ROW, components: row }] : []),
    ],
  };
}

/** Dates no longer on offer, a line each and small, so a long poll still fits a message */
function doneLines(dates: PollDate[]) {
  const fell = dates.filter((d) => d.fellThrough);
  const gone = dates.filter((d) => d.past && !d.fellThrough);
  return [
    ...fell.map((d) => `-# ~~<t:${unix(d.startsAt)}:F>~~ fell through`),
    gone.length ? `-# Gone by: ${gone.map((d) => `<t:${unix(d.startsAt)}:f>`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The copy of the post in its thread, where its buttons work (night-post.ts): Discord already
 * shows the post at the top of the thread, so the copy is only each date on offer with how many
 * can come, and the buttons, and doesn't read as the post twice
 */
export function buildPollThreadCopy(p: PollCard): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const row = pollRow(p, e);
  const dates =
    p.status === "open"
      ? p.dates.filter(onOffer).map((d) => ({
          type: SECTION,
          components: [{ type: TEXT, content: `${icon(e, "date")} <t:${unix(d.startsAt)}:F> · ${d.yes.length + d.maybe.length}` }],
          accessory: button({ kind: "pollVote", optionId: d.id }, "Works for me", buttonEmoji(e, "going")),
        }))
      : [{ type: TEXT, content: p.status === "cancelled" ? `-# ${icon(e, "cancelled")} Called off` : "-# Every date's gone by" }];
  return { flags: COMPONENTS_V2, components: [...dates, ...(row.length ? [{ type: ACTION_ROW, components: row }] : [])] };
}

/** The buttons under the dates: suggest, set, none work or call off while it's open; reopen once it's called off */
function pollRow(p: PollCard, e: AppEmoji): Component[] {
  const site = p.pollUrl ? [{ type: BUTTON, style: LINK_BUTTON_STYLE, label: `Open in ${p.siteName}`.slice(0, 80), url: p.pollUrl }] : [];
  if (p.status === "open") {
    return [
      button({ kind: "pollAdd", pollId: p.id }, "Suggest a date", buttonEmoji(e, "edit")),
      button({ kind: "pollPick", pollId: p.id }, "Set the date", buttonEmoji(e, "date")),
      button({ kind: "pollNone", pollId: p.id }, "None work", buttonEmoji(e, "declined")),
      button({ kind: "pollOff", pollId: p.id }, "Call it off", buttonEmoji(e, "cancelled")),
      ...site,
    ];
  }
  if (p.status === "closed") {
    return [button({ kind: "pollAdd", pollId: p.id }, "Suggest a date", buttonEmoji(e, "edit")), button({ kind: "pollOff", pollId: p.id }, "Call it off", buttonEmoji(e, "cancelled")), ...site];
  }
  // Called off by mistake, or plans changed back: it can open again while a date's still coming up
  return p.dates.some(onOffer) ? [button({ kind: "pollReopen", pollId: p.id }, "Reopen", buttonEmoji(e, "vote"))] : [];
}

/** One date on offer: when, how many can come and who, with the button beside it while it's open */
function dateRow(d: PollDate, open: boolean, e: AppEmoji): Component {
  const at = `<t:${unix(d.startsAt)}:F>`;
  const count = d.yes.length + d.maybe.length;
  const who = [d.yes.length && `> ${d.yes.map(person).join(", ")}`, d.maybe.length && `-# If they have to: ${d.maybe.map(person).join(", ")}`].filter(Boolean);
  const content = `${icon(e, "date")} **${at}** · ${count} can come\n${who.length ? who.join("\n") : "-# Nobody yet"}`;
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

/** The night's thread while it's finding its date; renamed with the date once it's set */
export const pollThreadName = (title: string) => `Date TBD · ${title}`.slice(0, 100);

/**
 * A date as the Set the date list shows it, in the group's time zone (a list can't show each
 * reader their own): "Thu, Nov 5, 7:00 PM · 3 can come"
 */
export function dateChoiceLabel(startsAt: string, coming: number, timeZone: string) {
  const at = new Date(startsAt).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${at} · ${coming ? `${coming} can come` : "nobody yet"}`;
}

/**
 * What the Date fell through form in Discord says about the other dates on offer, in its 100
 * characters: "Sun Nov 8 and Sun Nov 15 stay on offer, with their answers. Add more, or none."
 */
export function stayingLine(dates: string[], timeZone: string) {
  if (!dates.length) return "A date or two to offer instead of this one.";
  const day = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).replaceAll(",", "");
  const names = dates.map(day);
  const line = `${andList(names)} ${names.length === 1 ? "stays on offer, with its answers" : "stay on offer, with their answers"}. Add more, or none.`;
  return line.length <= 100 ? line : `Its ${names.length} other dates stay on offer, with their answers. Add more, or none.`;
}

/**
 * The note in the thread when a night's date falls through: who said so and which date, and a
 * ping for whoever was going to check which of the dates on offer work. Answers they'd given to
 * those stay, and the night keeps its games.
 */
export function refindMessage(n: { by: string; was: string; going: CardPerson[] }) {
  const going = n.going.filter((g) => g.discordId);
  const lines = [
    `↩️ ${n.by} says <t:${unix(n.was)}:F> fell through, so this is finding a date again.`,
    ...(going.length ? [`${andList(going.map(person))}, you were going. Check which dates work for you on the post.`] : []),
  ];
  return { body: { content: lines.join("\n") }, allowedMentions: { parse: [], users: [...new Set(going.map((g) => g.discordId!))] } };
}

/**
 * The reply on the post once its date's set: pings whoever the group set for its nights, and
 * the people coming, saying they're down as going (or a maybe) from what they answered, and asks
 * anyone who hadn't answered to say whether they're coming.
 */
export function pickedMessage(p: { title: string; startsAt: string; going: CardPerson[]; maybe: CardPerson[] }, ping: NightPing | null) {
  const going = p.going.filter((v) => v.discordId);
  const maybe = p.maybe.filter((v) => v.discordId);
  const lines = [
    `${ping ? `${ping.text} ` : ""}**${escape(p.title)}** is set for <t:${unix(p.startsAt)}:F> (<t:${unix(p.startsAt)}:R>).`,
    going.length && `${andList(going.map(person))} ${going.length === 1 ? "is" : "are"} down as going, since that date works for them.`,
    maybe.length && `${andList(maybe.map(person))} ${maybe.length === 1 ? "is" : "are"} down as a maybe.`,
    going.length || maybe.length ? "Anyone else, say on the post if you're coming." : "Say if you're coming on the post.",
  ].filter(Boolean);
  return {
    body: { content: lines.join("\n") },
    allowedMentions: {
      parse: ping?.allowedMentions.parse ?? [],
      ...(ping?.allowedMentions.roles ? { roles: ping.allowedMentions.roles } : {}),
      users: [...new Set([...going, ...maybe].map((v) => v.discordId!))],
    },
  };
}
