/**
 * A night's (or a poll's) announcement in the group's chat channel, for groups whose posts live
 * somewhere people don't read as they chat, like a forum (announceChannel in discord.ts). It
 * shows the details and links to the post, which has the buttons, so it has none of its own.
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
  return message(card, n.cancelled ? CANCELLED_ACCENT : NIGHT_ACCENT[n.kind], postUrl ? { label: "Open the event", url: postUrl } : null, ping);
}

export function buildPollAnnouncement(p: PollCard, postUrl: string | null, ping?: NightPing | null): { flags: number; components: Component[] } {
  const e = p.emoji ?? {};
  const open = p.status === "open";
  const title = p.status === "cancelled" ? `### ~~${escape(p.title)}~~\n${icon(e, "cancelled")} **Called off**` : `### ${escape(p.title)}`;
  const sub = ["Picking a date", p.kindName && escape(p.kindName)].filter(Boolean).join(" · ");
  const dates = open
    ? p.dates.filter((d) => !d.past).map((d) => `${icon(e, "date")} <t:${unix(d.startsAt)}:F> · ${d.voters.length}`)
    : p.status === "closed"
      ? ["-# Every date has gone by."]
      : [];
  const card: Component[] = [
    { type: TEXT, content: `${title}\n-# ${sub}` },
    ...(dates.length ? [{ type: TEXT, content: dates.join("\n") }] : []),
  ];
  return message(card, open ? NIGHT_ACCENT[p.kind] : CANCELLED_ACCENT, postUrl ? { label: open ? "Vote in the post" : "Open the poll", url: postUrl } : null, ping);
}

function message(card: Component[], accent: number, button: { label: string; url: string } | null, ping?: NightPing | null) {
  return {
    flags: COMPONENTS_V2,
    components: [
      // Above the card, on the first announcement only: edits drop it, and never ping
      ...(ping ? [{ type: TEXT, content: ping.text }] : []),
      { type: CONTAINER, accent_color: accent, components: card },
      ...(button ? [{ type: ACTION_ROW, components: [{ type: BUTTON, style: LINK_BUTTON_STYLE, label: button.label, url: button.url }] }] : []),
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
