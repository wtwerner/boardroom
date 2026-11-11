// Shared by the schema and client components — keep free of drizzle imports.

/**
 * Meeple colors to pick from. They can repeat, so a color is never the only thing saying who
 * someone is: a name or their face (Face in components/ui.tsx) does that. New ones go on the end,
 * since a player's color is stored by name.
 */
export const MEEPLE_COLORS = ["red", "blue", "yellow", "green", "purple", "orange", "black", "white", "pink", "teal", "brown"] as const;
export type MeepleColor = (typeof MEEPLE_COLORS)[number];

export const SENTIMENTS = ["love", "like", "meh", "nope"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/** "Must play" votes each member can hold at once. One is freed when they play that game. */
export const MUST_PLAY_LIMIT = 3;

/**
 * The core group's planned nights, and the casual night with guests and lighter games.
 * Each has its own Discord channel; the site itself is only for the core group.
 */
export const NIGHTS = ["core", "casual"] as const;
export type Night = (typeof NIGHTS)[number];

/** Someone's answer for a night. The waitlist is for nights with a seat limit that's full. */
export const RSVP_STATUSES = ["going", "maybe", "declined", "waitlist"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/**
 * Someone's answer to one of the dates a night might be on: it works, it works if they have to,
 * or they can't. Once someone's answered any date, a date they left alone counts as can't.
 */
export const DATE_ANSWERS = ["yes", "maybe", "no"] as const;
export type DateAnswer = (typeof DATE_ANSWERS)[number];

/** The most dates a poll can offer: each is a row with a button on its post, and Discord caps a message's parts */
export const POLL_MAX_DATES = 8;

/**
 * Games are ranked against their own kind: the longer, heavier games the core group plans
 * nights around, and lighter casual games. Which night a game was played on doesn't decide it.
 * These are stored keys; what the lists are called on the site is set in src/config.ts.
 */
export const TIERS = ["heavy", "light"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * What someone signed in can do. A member is in the core group: every page and action. A casual
 * account comes to the casual night only: their own ratings, rankings and collection, and that
 * night's answers, bring list and plays. Nothing about the core group's nights is shown to them.
 * Removed is someone an admin took off the site: they can't sign in, and count for nothing.
 * Boardroom decides it (src/lib/access.ts); Discord's member role follows.
 */
export const ACCESS = ["member", "casual", "removed"] as const;
export type Access = (typeof ACCESS)[number];
