/**
 * What a group sets for itself, from environment variables (all optional; see .env.example).
 * Server only: the browser doesn't see these, so client components get what they need as props.
 */

import type { Night } from "@/db/enums";
import { demoRefusal } from "@/lib/demo";
import { titleCase } from "@/lib/text";

const env = (name: string) => process.env[name]?.trim() || undefined;
const num = (name: string, fallback: number) => {
  const n = Number(env(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Where the site lives, for sign-in redirects and links in Discord posts. Set BETTER_AUTH_URL,
 * or on Vercel leave it out and the project's production domain is used.
 */
export const SITE_URL = (env("BETTER_AUTH_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") && `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`))?.replace(/\/$/, "");

/** The site's name: page titles, the header, and the button on plays it posts to Discord */
export const SITE_NAME = env("SITE_NAME") ?? "Boardroom";

/**
 * What each kind of night is called, everywhere the site names one: tags, switches, charts,
 * page text, Claude's prompts, and and the titles of nights it makes (see NIGHT_TITLES).
 */
export const NIGHT_NAMES: Record<Night, string> = {
  core: env("CORE_NIGHT_NAME") ?? "Game night",
  casual: env("CASUAL_NIGHT_NAME") ?? "Casual night",
};

/**
 * What a new night is called unless someone names it: {date} is its date ("10/29"), and {game}
 * the game locked in for it, or TBD. A title made this way follows the game as it's locked in.
 */
export const NIGHT_TITLES: Record<Night, string> = {
  core: env("CORE_NIGHT_TITLE") ?? `{date} ${titleCase(NIGHT_NAMES.core)}`,
  casual: env("CASUAL_NIGHT_TITLE") ?? `{date} ${titleCase(NIGHT_NAMES.casual)}`,
};

/** The group's time zone, for turning Discord timestamps and event times into calendar dates */
export const TIME_ZONE = env("APP_TIMEZONE") ?? "UTC";

/**
 * Whether the group has a casual night as well as its own: lighter games, guests, and a Discord
 * channel of its own. On when that channel is set, or with CASUAL_NIGHT=on (say, for local data
 * without Discord). Off, the site has one kind of night and never mentions the other.
 */
export const CASUAL_NIGHT = Boolean(env("DISCORD_CASUAL_CHANNEL_ID")) || env("CASUAL_NIGHT") === "on";

/** The kinds of night this group has: its own, and the casual night when it has one */
export const GROUP_NIGHTS: readonly Night[] = CASUAL_NIGHT ? ["core", "casual"] : ["core"];

/** BGG weight from which a game is ranked with the heavy games rather than the light ones */
export const HEAVY_WEIGHT = num("HEAVY_GAME_WEIGHT", 2.75);

/**
 * How many hours before a night starts its channel is reminded, pinging whoever's going or a
 * maybe. 0 turns the reminder off. Needs something calling /api/cron/tick through the day.
 */
export const REMINDER_HOURS = env("NIGHT_REMINDER_HOURS") === "0" ? 0 : num("NIGHT_REMINDER_HOURS", 3);

/**
 * Whether the site uses Claude: picks on Discover and a night's page, and reading hand-written
 * play posts the parser can't. On with CLAUDE=on, and it needs ANTHROPIC_API_KEY too. Off, the
 * site never calls Claude or mentions it.
 */
export const CLAUDE = env("CLAUDE") === "on";

/** Claude's picks each person can ask for in a day, which keeps the Anthropic bill predictable */
export const CLAUDE_IDEAS_PER_DAY = num("CLAUDE_IDEAS_PER_DAY", 5);

/**
 * A public demo on a made-up group (src/lib/demo.ts): anyone can sign in as one of its members,
 * every page says it's a demo, and the nightly cron puts the group back as it was instead of
 * syncing. On with DEMO=on, and only on a site without Discord set up, so a real group's site
 * can't turn it on by mistake.
 */
export const DEMO = demoRefusal(process.env) === null;
