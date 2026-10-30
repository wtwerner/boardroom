/** Discord's message component numbers and shared helpers for the posts the app makes. Pure. */

/** Discord's "this message is built from components" flag (IS_COMPONENTS_V2) */
export const COMPONENTS_V2 = 1 << 15;

// Component type numbers from Discord's API
export const ACTION_ROW = 1;
export const BUTTON = 2;
export const STRING_SELECT = 3;
export const SECTION = 9;
export const TEXT = 10;
export const THUMBNAIL = 11;
export const MEDIA_GALLERY = 12;
export const SEPARATOR = 14;
export const CONTAINER = 17;

// Button styles
export const PRIMARY = 1;
export const SECONDARY = 2;
export const SUCCESS = 3;
export const DANGER = 4;
export const LINK_BUTTON_STYLE = 5;

/** The felt green used across the site */
export const ACCENT = 0x1e4a3b;

/** Each kind of night's color, as the site's charts show them, for its posts in the events channel */
export const NIGHT_ACCENT = { core: 0x1f8058, casual: 0xc0801a } as const;

export type Component = Record<string, unknown>;

/** Keep names and notes from being read as Discord markdown */
export const escape = (s: string) => s.replace(/([\\*_~`|[\]])/g, "\\$1");

/** "A", "A and B", "A, B and C" */
export function listNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A discord.com message link as one the Discord app opens (discord://-/channels/…), rather than the web app */
export function discordAppUrl(webUrl: string) {
  const path = webUrl.match(/^https:\/\/(?:\w+\.)?discord\.com\/(channels\/[\d/@me]+)$/)?.[1];
  return path ? `discord://-/${path}` : null;
}
