/**
 * A night's post in its events channel, as a Components V2 message: when and where, who's
 * coming, the plan so far, and buttons to answer or edit it. Discord shows each person the
 * time in their own time zone. Pure so it can be tested; night-post.ts sends it.
 */

import type { Night } from "@/db/enums";
import { type AppEmoji, buttonEmoji, icon } from "./icons";
import { type Action, actionId } from "./interactions";
import {
  ACTION_ROW,
  BUTTON,
  COMPONENTS_V2,
  CONTAINER,
  type Component,
  LINK_BUTTON_STYLE,
  NIGHT_ACCENT,
  SECONDARY,
  SECTION,
  SEPARATOR,
  TEXT,
  THUMBNAIL,
  escape,
} from "./discord-components";

/** Grey for a night that was cancelled */
export const CANCELLED_ACCENT = 0x8a8f98;

export type CardPerson = { name: string; discordId?: string | null; guests?: number };
export type CardGame = { name: string; bggId?: number | null; imageUrl?: string | null };

export type NightCard = {
  id: number;
  title: string;
  /** ISO timestamp */
  startsAt: string;
  location: string | null;
  capacity: number | null;
  cancelled: boolean;
  kind: Night;
  /** What this kind of night is called, when the group has more than one kind */
  kindName: string | null;
  going: CardPerson[];
  maybe: CardPerson[];
  declined: CardPerson[];
  /** Others coming who aren't named, counted on the site */
  others: number;
  plan:
    | { kind: "vote"; lockedIn: CardGame | null; proposals: (CardGame & { votes: number })[] }
    /** asked: someone asked to bring it who hasn't answered yet */
    | { kind: "bring"; games: (CardGame & { bringer: CardPerson | null; asked?: CardPerson | null })[] };
  /** The night's page, for the Plan it button. Left off where most people can't open the site. */
  planUrl: string | null;
  siteName: string;
  /** The bot's own emoji, once uploaded; plain emoji without them */
  emoji?: AppEmoji;
};

export function buildNightMessage(n: NightCard, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = n.emoji ?? {};
  const unix = Math.floor(Date.parse(n.startsAt) / 1000);
  const title = n.cancelled ? `## ~~${escape(n.title)}~~\n${icon(e, "cancelled")} **Cancelled**` : `## ${escape(n.title)}`;
  const header = [title, n.kindName && `-# ${escape(n.kindName)}`].filter(Boolean).join("\n");
  const lockedIn = n.plan.kind === "vote" ? n.plan.lockedIn : null;
  const count = headcount(n);

  const card: Component[] = [
    lockedIn?.imageUrl ? withBox(header, lockedIn.name, lockedIn.imageUrl) : { type: TEXT, content: header },
    // The symbols say what each line is, so no headings
    { type: TEXT, content: [`${icon(e, "date")} <t:${unix}:F>`, `${icon(e, "countdown")} <t:${unix}:R>`, n.location && `${icon(e, "place")} ${escape(n.location)}`].filter(Boolean).join("\n") },
    { type: SEPARATOR, divider: true, spacing: 2 },
    // Names in a quote under each answer: going a name to a line; maybe and can't make it run on, being read less
    { type: TEXT, content: goingBlock(`${icon(e, "going")} **Going** · ${count}${n.capacity ? `/${n.capacity}` : ""}`, n.going, n.others) },
    ...(n.maybe.length ? [{ type: TEXT, content: `${icon(e, "maybe")} **Maybe** · ${n.maybe.length}\n> ${n.maybe.map(person).join(", ")}` }] : []),
    ...(n.declined.length ? [{ type: TEXT, content: `${icon(e, "declined")} **Can't make it** · ${n.declined.length}\n> ${n.declined.map(person).join(", ")}` }] : []),
    { type: SEPARATOR, divider: true, spacing: 2 },
    ...planComponents(n.plan, e),
  ];

  return {
    flags: COMPONENTS_V2,
    components: [
      // Above the card, on the first post only: edits drop it, and never ping
      ...(ping ? [{ type: TEXT, content: ping.text }] : []),
      { type: CONTAINER, accent_color: n.cancelled ? CANCELLED_ACCENT : NIGHT_ACCENT[n.kind], components: card },
      ...nightRows(n, e).map((components) => ({ type: ACTION_ROW, components })),
    ],
  };
}

/** Everyone going, with their guests and the others counted on the site */
const headcount = (n: NightCard) => n.going.reduce((sum, p) => sum + 1 + (p.guests ?? 0), 0) + n.others;

/**
 * The copy of the post in its thread, where its buttons work (night-post.ts): Discord already
 * shows the post at the top of the thread, so the copy is only a count of answers and the
 * buttons, and doesn't read as the post twice
 */
export function buildNightThreadCopy(n: NightCard): { flags: number; components: Component[] } {
  const e = n.emoji ?? {};
  const tally = n.cancelled ? `${icon(e, "cancelled")} Cancelled` : answerTally(n, e);
  return {
    flags: COMPONENTS_V2,
    components: [{ type: TEXT, content: `-# ${tally}` }, ...nightRows(n, e).map((components) => ({ type: ACTION_ROW, components }))],
  };
}

/** How many have answered each way, on one line: "✅ 3/6 going · ❔ 1 maybe". Answers nobody's given are left off. */
export function answerTally(n: NightCard, e: AppEmoji) {
  return [
    `${icon(e, "going")} ${headcount(n)}${n.capacity ? `/${n.capacity}` : ""} going`,
    n.maybe.length && `${icon(e, "maybe")} ${n.maybe.length} maybe`,
    n.declined.length && `${icon(e, "declined")} ${n.declined.length} can't`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A row holds five buttons: answers on the first, the rest on the second. The answers are only
 * the symbols the card heads their lists with, so the row fits a phone without wrapping
 */
function nightRows(n: NightCard, e: AppEmoji): Component[][] {
  if (n.cancelled) return [];
  return [
    [
      button({ kind: "rsvp", nightId: n.id, status: "going" }, null, buttonEmoji(e, "going")),
      button({ kind: "rsvp", nightId: n.id, status: "maybe" }, null, buttonEmoji(e, "maybe")),
      button({ kind: "rsvp", nightId: n.id, status: "declined" }, null, buttonEmoji(e, "declined")),
      button({ kind: "for", nightId: n.id }, "Someone else…", buttonEmoji(e, "someone")),
    ],
    [
      button({ kind: "edit", nightId: n.id }, "Edit", buttonEmoji(e, "edit")),
      button({ kind: "refind", nightId: n.id }, "Find a new date", buttonEmoji(e, "date")),
      ...(n.planUrl ? [{ type: BUTTON, style: LINK_BUTTON_STYLE, label: `Plan it in ${n.siteName}`.slice(0, 80), url: n.planUrl }] : []),
    ],
  ];
}

function goingBlock(heading: string, people: CardPerson[], others: number) {
  const more = others ? `${people.length ? "and " : ""}${others} ${others === 1 ? "other" : "others"}` : null;
  const lines = [...people.map(person), ...(more ? [`-# ${more}`] : [])];
  return `${heading}\n${lines.length ? lines.map((l) => `> ${l}`).join("\n") : "-# Nobody yet"}`;
}

/** Text with a game's box beside it */
export function withBox(content: string, name: string, imageUrl: string): Component {
  return { type: SECTION, components: [{ type: TEXT, content }], accessory: { type: THUMBNAIL, media: { url: imageUrl }, description: name } };
}

/** What's left of a post whose night was deleted, where the post itself can't be */
export function goneMessage() {
  return { flags: COMPONENTS_V2, components: [{ type: CONTAINER, accent_color: CANCELLED_ACCENT, components: [{ type: TEXT, content: "This event was deleted or moved." }] }] };
}

/** What's left of a post whose night moved to another channel, pointing to where it is now */
export function movedMessage(url: string | null) {
  const text = url ? `This event moved: [answer and talk it over in its new post](${url}).` : "This event moved to another channel.";
  return { flags: COMPONENTS_V2, components: [{ type: CONTAINER, accent_color: CANCELLED_ACCENT, components: [{ type: TEXT, content: text }] }] };
}

/**
 * What the night's thread is called: the night's title, with its date ("10/29 Game Night").
 * A title that doesn't start with its date gets it in front, so threads list in date order by
 * eye ("10/29 Thursday heavy"). 100 characters at most.
 */
export function threadName(title: string, startsAt: string, timeZone: string) {
  const [m, d, y] = new Date(startsAt).toLocaleDateString("en-US", { timeZone, month: "numeric", day: "numeric", year: "numeric" }).split("/");
  const dated = new RegExp(`^0?${m}/0?${d}(/(${y}|${y.slice(2)}))?(\\s|$)`).test(title);
  return (dated ? title : `${m}/${d} ${title}`).slice(0, 100);
}

/**
 * Who a night's first post pings, from the group's setting: "here", "everyone", or a role
 * id. Null for none (or a setting that's none of those).
 */
export function nightPing(setting: string | undefined): NightPing | null {
  const s = setting?.trim();
  if (s === "here" || s === "everyone") return { text: `@${s}`, allowedMentions: { parse: ["everyone"] } };
  if (s && /^\d{17,20}$/.test(s)) return { text: `<@&${s}>`, allowedMentions: { parse: [], roles: [s] } };
  return null;
}

export type NightPing = { text: string; allowedMentions: { parse: "everyone"[]; roles?: string[] } };

/** Said in the thread when a night moves, so people following it notice */
export function changeNote(
  before: { startsAt: string; location: string | null; title: string },
  after: { startsAt: string; location: string | null; title: string },
  by: CardPerson,
  e: AppEmoji = {},
) {
  const unix = Math.floor(Date.parse(after.startsAt) / 1000);
  const changes = [
    before.startsAt !== after.startsAt && `${icon(e, "date")} now <t:${unix}:F> (<t:${unix}:R>)`,
    (before.location ?? "") !== (after.location ?? "") && `${icon(e, "place")} ${after.location ? `now at ${escape(after.location)}` : "no place set now"}`,
    before.title !== after.title && `${icon(e, "edit")} now called ${escape(after.title)}`,
  ].filter(Boolean);
  return changes.length ? `${person(by)} changed the event:\n${changes.join("\n")}` : null;
}

export function person(p: CardPerson) {
  const name = p.discordId ? `<@${p.discordId}>` : escape(p.name);
  return p.guests ? `${name} +${p.guests}` : name;
}

function button(action: Action, label: string | null, emoji: { id?: string; name: string }): Component {
  return { type: BUTTON, style: SECONDARY, ...(label ? { label } : {}), custom_id: actionId(action), emoji };
}

export function link(g: CardGame) {
  return g.bggId ? `[${escape(g.name)}](https://boardgamegeek.com/boardgame/${g.bggId})` : escape(g.name);
}

function planComponents(plan: NightCard["plan"], e: AppEmoji): Component[] {
  const text = (content: string): Component => ({ type: TEXT, content });
  if (plan.kind === "bring") {
    const heading = `${icon(e, "bringing")} **Bringing**`;
    if (!plan.games.length) return [text(`${heading}\n-# Nobody's said what they're bringing yet`)];
    // A line per person bringing, then games asked for, then games nobody's named as bringing
    const byBringer = new Map<string, { bringer: CardPerson; games: CardGame[] }>();
    const asked: string[] = [];
    const unclaimed: CardGame[] = [];
    for (const g of plan.games) {
      if (!g.bringer && g.asked) asked.push(`-# Asked ${person(g.asked)} · ${link(g)}`);
      else if (!g.bringer) unclaimed.push(g);
      else {
        const key = g.bringer.discordId ?? g.bringer.name;
        const entry = byBringer.get(key);
        if (entry) entry.games.push(g);
        else byBringer.set(key, { bringer: g.bringer, games: [g] });
      }
    }
    const lines = [...[...byBringer.values()].map((b) => `${person(b.bringer)} · ${b.games.map(link).join(", ")}`), ...asked, ...unclaimed.map(link)];
    return [text(`${heading}\n${lines.join("\n")}`)];
  }
  if (plan.lockedIn) return [text(`${icon(e, "playing")} **Playing**\n${link(plan.lockedIn)}`)];
  if (!plan.proposals.length) return [text(`${icon(e, "vote")} **The game**\n-# Nothing proposed yet`)];
  const top = [...plan.proposals].sort((a, b) => b.votes - a.votes).slice(0, 5);
  const more = plan.proposals.length - top.length;
  const votes = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;
  return [text(`${icon(e, "vote")} **Proposed**\n${top.map((g) => `${link(g)} · ${votes(g.votes)}`).join("\n")}${more > 0 ? `\n-# and ${more} more` : ""}`)];
}
