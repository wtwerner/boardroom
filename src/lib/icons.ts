/**
 * The symbols on the app's Discord posts. Each is one of the bot's own emoji (the Font Awesome
 * icons in assets/discord-emoji, uploaded by `pnpm discord:commands`), or the plain emoji here
 * until they're uploaded. Pure; discord.ts looks up the uploaded ones.
 */

export const ICONS = {
  going: "✅",
  maybe: "❔",
  declined: "❌",
  date: "📅",
  countdown: "⏳",
  place: "📍",
  bringing: "🎲",
  playing: "🎲",
  vote: "🗳️",
  someone: "👥",
  edit: "✏️",
  cancelled: "🚫",
  players: "🤼",
  first: "🎉",
  notes: "📝",
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** The bot's own emoji ids, by name */
export type AppEmoji = Partial<Record<IconName, string>>;

/** The symbol in a message's text */
export function icon(emoji: AppEmoji, name: IconName) {
  const id = emoji[name];
  return id ? `<:${name}:${id}>` : ICONS[name];
}

/** The symbol on a button */
export function buttonEmoji(emoji: AppEmoji, name: IconName) {
  const id = emoji[name];
  return id ? { id, name } : { name: ICONS[name] };
}

/** The bot's emoji that are Boardroom's symbols, from Discord's list of them */
export function appEmoji(items: { id: string; name: string }[]): AppEmoji {
  return Object.fromEntries(items.filter((e) => e.name in ICONS).map((e) => [e.name, e.id]));
}
