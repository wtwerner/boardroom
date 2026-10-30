/**
 * The play message the app posts to Discord, as a Components V2 message: a card with
 * the box art, who played, and link buttons. Pure so it can be tested.
 *
 * Its text keeps the date / place / players / game lines the play-log parser reads (with the
 * bot's own symbols, or 📅 / 📍 / 🤼 / 🎲 until they're uploaded), so posts can be re-imported
 * from the channel if the database is ever rebuilt.
 */

import { SITE_NAME } from "@/config";

import { type AppEmoji, icon } from "./icons";
import { ACCENT, ACTION_ROW, BUTTON, COMPONENTS_V2, CONTAINER, LINK_BUTTON_STYLE, MEDIA_GALLERY, SECTION, SEPARATOR, TEXT, THUMBNAIL, type Component, escape, listNames } from "./discord-components";

export { COMPONENTS_V2 };

/** Gold for a game's first play with the group */
const FIRST_PLAY_ACCENT = 0xc9960f;

export type PostedGame = {
  gameName: string;
  bggId?: number | null;
  /** Box art */
  imageUrl?: string | null;
  /** How many times the group has now played it, counting this one */
  playNumber?: number;
  /** Link to the game's page in the app */
  appUrl?: string | null;
};

export type PlayPost = {
  /** The games played together; usually just one */
  games: PostedGame[];
  playedOn: string; // YYYY-MM-DD
  location?: string | null;
  notes?: string | null;
  players: { name: string; discordId?: string | null }[];
  loggedBy?: string;
  /** The night's thread in Discord, linked at the bottom */
  threadId?: string | null;
  /** The night's page in the app, for a post of several games */
  nightUrl?: string | null;
  /** The bot's own emoji, once uploaded; plain emoji without them */
  emoji?: AppEmoji;
};

export function buildPlayMessage(p: PlayPost): { flags: number; components: Component[] } {
  const [y, m, d] = p.playedOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const e = p.emoji ?? {};
  const bgg = (g: PostedGame) => (g.bggId ? `https://boardgamegeek.com/boardgame/${g.bggId}` : null);
  // "A + B" on one line, the same way people write a night by hand, so it parses back into one play each
  const title = `### ${icon(e, "playing")} ${p.games.map((g) => (bgg(g) ? `[${escape(g.gameName)}](${bgg(g)})` : escape(g.gameName))).join(" + ")}`;
  const header = [title, `${icon(e, "date")} ${date}`, p.location && `${icon(e, "place")} ${escape(p.location)}`].filter(Boolean).join("\n");
  const who = p.players.map((pl) => (pl.discordId ? `<@${pl.discordId}>` : escape(pl.name))).join(", ");
  const [only] = p.games.length === 1 ? p.games : [];
  const firsts = p.games.filter((g) => g.playNumber === 1);
  const playCount = only
    ? only.playNumber === 1
      ? `${icon(e, "first")} First time playing it together`
      : only.playNumber
        ? `${ordinal(only.playNumber)} time playing it together`
        : null
    : firsts.length
      ? `${icon(e, "first")} First time playing ${listNames(firsts.map((g) => escape(g.gameName)))} together`
      : null;
  const footer = [[playCount, p.loggedBy && `logged by ${escape(p.loggedBy)}`].filter(Boolean).join(", "), p.threadId && `<#${p.threadId}>`]
    .filter(Boolean)
    .join(" · ");
  const art = p.games.filter((g) => g.imageUrl);

  const card: Component[] = [
    only?.imageUrl
      ? { type: SECTION, components: [{ type: TEXT, content: header }], accessory: { type: THUMBNAIL, media: { url: only.imageUrl }, description: only.gameName } }
      : { type: TEXT, content: header },
    // Several games: every box side by side
    ...(!only && art.length ? [{ type: MEDIA_GALLERY, items: art.slice(0, 10).map((g) => ({ media: { url: g.imageUrl }, description: g.gameName })) }] : []),
    { type: SEPARATOR, divider: true, spacing: 1 },
    { type: TEXT, content: `${icon(e, "players")} ${who}` },
    ...(p.notes ? [{ type: TEXT, content: `${icon(e, "notes")} ${escape(p.notes)}` }] : []),
    ...(footer ? [{ type: TEXT, content: `-# ${footer}` }] : []),
  ];

  // One game: its BGG page and its page here. Several: each is linked in the title already, and
  // a button apiece wraps unevenly under the card, so there's one to the night's page here
  const buttons = (
    only
      ? [
          bgg(only) && { type: BUTTON, style: LINK_BUTTON_STYLE, label: "BoardGameGeek", url: bgg(only) },
          only.appUrl && { type: BUTTON, style: LINK_BUTTON_STYLE, label: `Open in ${SITE_NAME}`, url: only.appUrl },
        ]
      : [p.nightUrl && { type: BUTTON, style: LINK_BUTTON_STYLE, label: `See the night in ${SITE_NAME}`.slice(0, 80), url: p.nightUrl }]
  ).filter(Boolean) as Component[];

  return {
    flags: COMPONENTS_V2,
    components: [
      { type: CONTAINER, accent_color: firsts.length ? FIRST_PLAY_ACCENT : ACCENT, components: card },
      ...(buttons.length ? [{ type: ACTION_ROW, components: buttons }] : []),
    ],
  };
}

/** All the text in a Components V2 message, in order, so the play-log parser can read it. */
export function componentText(components: unknown): string {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const node = c as { type?: number; content?: unknown; components?: unknown[] };
    if (node.type === TEXT && typeof node.content === "string") out.push(node.content);
    for (const child of node.components ?? []) walk(child);
  };
  for (const c of Array.isArray(components) ? components : []) walk(c);
  return out.join("\n");
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
