// Shared by the schema and client components — keep free of drizzle imports.

// Order matters: adjacent colors are validated to stay distinguishable (incl. color-blind).
export const MEEPLE_COLORS = ["red", "blue", "yellow", "green", "purple", "orange"] as const;
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
 * Where a poll to find a night's date stands: open for votes, picked (it became a night, and
 * its post became the night's), called off, or closed because every date went by.
 */
export const POLL_STATUSES = ["open", "picked", "cancelled", "closed"] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

/** The most dates a poll can offer: each is a row with a button on its post, and Discord caps a message's parts */
export const POLL_MAX_DATES = 8;

/**
 * Games are ranked against their own kind: the longer, heavier games the core group plans
 * nights around, and lighter casual games. Which night a game was played on doesn't decide it.
 * These are stored keys; what the lists are called on the site is set in src/config.ts.
 */
export const TIERS = ["heavy", "light"] as const;
export type Tier = (typeof TIERS)[number];
