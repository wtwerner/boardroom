/**
 * A night's announcement in the group's chat channel, for groups whose posts live
 * somewhere people don't read as they chat, like a forum (announceChannel in discord.ts). It
 * shows the details and links to the post, which has the buttons, so it has none of its own
 * (and while a date's being picked, to its page on the site too).
 * Pure so it can be tested; announce-post.ts sends it.
 */

import { type AppEmoji, icon } from "./icons";
import { type NightCard, type NightPing, CANCELLED_ACCENT, answerTally, link, withBox } from "./night-message";
import type { PollCard } from "./poll-message";
import { ACTION_ROW, BUTTON, COMPONENTS_V2, CONTAINER, type Component, LINK_BUTTON_STYLE, NIGHT_ACCENT, TEXT, escape } from "./discord-components";

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export function buildNightAnnouncement(n: NightCard, postUrl: string | null, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = n.emoji ?? {};
  const at = unix(n.startsAt);
  const title = n.cancelled ? `### ~~${escape(n.title)}~~\n${icon(e, "cancelled")} **Cancelled**` : `### ${escape(n.title)}`;
  const header = [title, n.kindName && `-# ${escape(n.kindName)}`].filter(Boolean).join("\n");
  const lockedIn = n.plan.kind === "vote" ? n.plan.lockedIn : null;
  const details = [
    `${icon(e, "date")} <t:${at}:F> (<t:${at}:R>)`,
    n.location && `${icon(e, "place")} ${escape(n.location)}`,
    !n.cancelled && answerTally(n, e),
    !n.cancelled && planLine(n.plan, e),
  ].filter(Boolean);
  const card: Component[] = [
    lockedIn?.imageUrl ? withBox(header, lockedIn.name, lockedIn.imageUrl) : { type: TEXT, content: header },
    { type: TEXT, content: details.join("\n") },
  ];
  return message(card, n.cancelled ? CANCELLED_ACCENT : NIGHT_ACCENT[n.kind], postUrl ? [{ label: "Open the event", url: postUrl }] : [], ping);
}

export function buildPollAnnouncement(p: PollCard, postUrl: string | null, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const open = p.status === "open";
  const title = p.status === "cancelled" ? `### ~~${escape(p.title)}~~\n${icon(e, "cancelled")} **Called off**` : `### ${escape(p.title)}`;
  const sub = ["Date TBD", p.kindName && escape(p.kindName)].filter(Boolean).join(" · ");
  const dates = open
    ? p.dates.filter((d) => !d.past && !d.fellThrough).map((d) => `${icon(e, "date")} <t:${unix(d.startsAt)}:F> · ${d.yes.length + d.maybe.length} can come`)
    : p.status === "closed"
      ? ["-# Every date's gone by."]
      : [];
  const card: Component[] = [
    { type: TEXT, content: `${title}\n-# ${sub}` },
    ...(dates.length ? [{ type: TEXT, content: dates.join("\n") }] : []),
  ];
  const buttons = [
    postUrl && { label: open ? "Say which dates work" : "Open the event", url: postUrl },
    // While it's being planned, the site has the rest: games, who's coming, answering for someone
    open && p.pollUrl && { label: `Help plan it on ${p.siteName}`.slice(0, 80), url: p.pollUrl },
  ].filter((b) => !!b);
  return message(card, p.status === "cancelled" ? CANCELLED_ACCENT : NIGHT_ACCENT[p.kind], buttons, ping);
}

function message(card: Component[], accent: number, buttons: { label: string; url: string }[], ping?: NightPing | null) {
  return {
    flags: COMPONENTS_V2,
    components: [
      // Above the card, on the first announcement only: edits drop it, and never ping
      ...(ping ? [{ type: TEXT, content: ping.text }] : []),
      { type: CONTAINER, accent_color: accent, components: card },
      ...(buttons.length ? [{ type: ACTION_ROW, components: buttons.map((b) => ({ type: BUTTON, style: LINK_BUTTON_STYLE, label: b.label, url: b.url })) }] : []),
    ],
  };
}

/** The plan in a line: the game locked in, the top proposals, or what's being brought */
function planLine(plan: NightCard["plan"], e: AppEmoji) {
  const some = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));
  if (plan.kind === "bring") return plan.games.length ? `${icon(e, "bringing")} Bringing ${some(plan.games.map(link))}` : null;
  if (plan.lockedIn) return `${icon(e, "playing")} Playing ${link(plan.lockedIn)}`;
  if (!plan.proposals.length) return null;
  return `${icon(e, "vote")} Proposed ${some([...plan.proposals].sort((a, b) => b.votes - a.votes).map(link))}`;
}
