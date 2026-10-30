/**
 * What a group sets for itself. Its admins set most of it on Group settings (src/lib/settings.ts);
 * the rest are environment variables, set once with the site. Server only: the browser doesn't
 * see these, so client components get what they need as props.
 *
 * The values here start from the environment variables and are replaced with the group's saved
 * settings by loadSettings() (src/lib/settings-store.ts), which every page, action, route and
 * script awaits before reading them. They're live bindings: read them where they're used, never
 * into a constant at the top of a module.
 */

import type { Night } from "@/db/enums";
import { demoRefusal } from "@/lib/demo";
import { type GroupSettings, resolveSettings } from "@/lib/settings";
import { titleCase } from "@/lib/text";

const env = (name: string) => process.env[name]?.trim() || undefined;

/**
 * Where the site lives, for sign-in redirects and links in Discord posts. Set BETTER_AUTH_URL,
 * or on Vercel leave it out and the project's production domain is used.
 */
export const SITE_URL = (env("BETTER_AUTH_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") && `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`))?.replace(/\/$/, "");

/**
 * A public demo on a made-up group (src/lib/demo.ts): anyone can sign in as one of its members,
 * every page says it's a demo, and the nightly cron puts the group back as it was instead of
 * syncing. On with DEMO=on, and only on a site without Discord set up, so a real group's site
 * can't turn it on by mistake.
 */
export const DEMO = demoRefusal(process.env) === null;

/** Everything on Group settings, as saved. The Discord channels and roles are read through src/lib/discord.ts */
export let SETTINGS: GroupSettings;

/** The site's name: page titles, the header, and the button on plays it posts to Discord */
export let SITE_NAME: string;

/**
 * What each kind of night is called, everywhere the site names one: tags, switches, charts,
 * page text, Claude's prompts, and the titles of nights it makes (see NIGHT_TITLES).
 */
export let NIGHT_NAMES: Record<Night, string>;

/**
 * What a new night is called unless someone names it: {date} is its date ("10/29"), and {game}
 * the game locked in for it, or TBD. A title made this way follows the game as it's locked in.
 */
export let NIGHT_TITLES: Record<Night, string>;

/** The group's time zone, for turning Discord timestamps and event times into calendar dates */
export let TIME_ZONE: string;

/**
 * Whether the group has a casual night as well as its own: lighter games, guests, and Discord
 * channels of its own. Off, the site has one kind of night and never mentions the other.
 */
export let CASUAL_NIGHT: boolean;

/** The kinds of night this group has: its own, and the casual night when it has one */
export let GROUP_NIGHTS: readonly Night[];

/** BGG weight from which a game is ranked with the heavy games rather than the light ones */
export let HEAVY_WEIGHT: number;

/**
 * How many hours before a night starts its channel is reminded, pinging whoever's going or a
 * maybe. 0 turns the reminder off. Needs something calling /api/cron/tick through the day.
 */
export let REMINDER_HOURS: number;

/**
 * The fewest who need to be able to come for a date on offer to be worth setting, by kind of
 * night: fewer, and the dates show as too few (poll-store.ts)
 */
export let MIN_PEOPLE: Record<Night, number>;

/**
 * Whether the site uses Claude: picks on Discover and a night's page, and reading hand-written
 * play posts the parser can't. It needs ANTHROPIC_API_KEY too. Off, the site never calls Claude
 * or mentions it.
 */
export let CLAUDE: boolean;

/** Claude's picks each person can ask for in a day, which keeps the Anthropic bill predictable */
export let CLAUDE_IDEAS_PER_DAY: number;

/** Put the group's settings in place. Only settings-store.ts calls this, with what it read from the database */
export function applySettings(s: GroupSettings) {
  SETTINGS = s;
  SITE_NAME = s.siteName;
  NIGHT_NAMES = { core: s.coreNightName, casual: s.casualNightName };
  NIGHT_TITLES = {
    core: s.coreNightTitle ?? `{date} ${titleCase(s.coreNightName)}`,
    casual: s.casualNightTitle ?? `{date} ${titleCase(s.casualNightName)}`,
  };
  TIME_ZONE = s.timeZone;
  CASUAL_NIGHT = s.casualNight;
  GROUP_NIGHTS = s.casualNight ? ["core", "casual"] : ["core"];
  HEAVY_WEIGHT = s.heavyWeight;
  REMINDER_HOURS = s.reminderHours;
  MIN_PEOPLE = { core: s.coreMinPeople, casual: s.casualMinPeople };
  CLAUDE = s.claude;
  CLAUDE_IDEAS_PER_DAY = s.claudeIdeasPerDay;
}

applySettings(resolveSettings({}, process.env));
