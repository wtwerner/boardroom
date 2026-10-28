import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { type MeepleColor, NIGHTS, POLL_STATUSES, RSVP_STATUSES, SENTIMENTS, TIERS } from "./enums";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth tables (shape required by the drizzle adapter)
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  discordId: text("discord_id").unique(),
  bggUsername: text("bgg_username"),
  /** Their Board Game Arena name, so the others can find them there */
  bgaUsername: text("bga_username"),
  /** BGA Premium: they can open tables for Premium games */
  bgaPremium: integer("bga_premium", { mode: "boolean" }).notNull().default(false),
  /** When they saved the name the group sees, the first step of getting set up. Until then it's their Discord name */
  nameChosenAt: integer("name_chosen_at", { mode: "timestamp_ms" }),
  /** Can change the group's settings and make other members admins. While nobody is one, everyone can */
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Games & collections (BGG)
// ---------------------------------------------------------------------------

/** One row per BGG "thing". `id` is the BGG object id. */
export const game = sqliteTable("game", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year"),
  thumbnail: text("thumbnail"),
  image: text("image"),
  minPlayers: integer("min_players"),
  maxPlayers: integer("max_players"),
  /** Player counts the BGG community voted "Best" */
  bestPlayers: text("best_players", { mode: "json" }).$type<number[]>(),
  minPlaytime: integer("min_playtime"),
  maxPlaytime: integer("max_playtime"),
  weight: real("weight"),
  bggRating: real("bgg_rating"),
  bggRank: integer("bgg_rank"),
  categories: text("categories", { mode: "json" }).$type<string[]>(),
  mechanics: text("mechanics", { mode: "json" }).$type<string[]>(),
  description: text("description"),
  /** Set by hand to rank it with the other tier's games; null means its BGG weight decides (see tier.ts) */
  tier: text("tier", { enum: TIERS }),
  /** When we last pulled full details from /thing */
  detailsFetchedAt: integer("details_fetched_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const collectionItem = sqliteTable(
  "collection_item",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    own: integer("own", { mode: "boolean" }).notNull().default(false),
    wishlist: integer("wishlist", { mode: "boolean" }).notNull().default(false),
    wantToPlay: integer("want_to_play", { mode: "boolean" }).notNull().default(false),
    prevOwned: integer("prev_owned", { mode: "boolean" }).notNull().default(false),
    /** The user's personal BGG rating (1-10) */
    bggUserRating: real("bgg_user_rating"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

// ---------------------------------------------------------------------------
// People & plays
// ---------------------------------------------------------------------------


/**
 * Anyone who shows up in a play log. Core members link to a `user`;
 * occasional guests just have a name.
 */
export const player = sqliteTable("player", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** Lowercased alternate spellings / Discord handles used in play logs */
  aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
  color: text("color").$type<MeepleColor>(),
  /** Used to @-tag them when the app posts a play to Discord */
  discordId: text("discord_id").unique(),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  /** When someone invited them to the core group's nights (gave them the member role), before they'd signed in */
  welcomedAt: integer("welcomed_at", { mode: "timestamp_ms" }),
  welcomedBy: text("welcomed_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

export const play = sqliteTable(
  "play",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id").references(() => game.id, { onDelete: "set null" }),
    /** Name as written in the log — kept so unmatched games can be fixed later */
    gameName: text("game_name").notNull(),
    /** ISO date (YYYY-MM-DD) */
    playedOn: text("played_on").notNull(),
    location: text("location"),
    notes: text("notes"),
    source: text("source", { enum: ["discord", "manual"] }).notNull(),
    /** Which night it was: the core group's, or the casual night with guests (its own Discord channel) */
    night: text("night", { enum: NIGHTS }).notNull().default("core"),
    /** Discord message id (+ index when one message logs several games) */
    sourceRef: text("source_ref").unique(),
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("play_played_on_idx").on(t.playedOn), index("play_game_idx").on(t.gameId)],
);

export const playPlayer = sqliteTable(
  "play_player",
  {
    playId: integer("play_id")
      .notNull()
      .references(() => play.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    /**
     * The name as the log wrote it, when more than one player has it ("Which Lee?"). They're
     * seated as the likeliest until someone says which; null once that's settled.
     */
    ambiguousName: text("ambiguous_name"),
  },
  (t) => [primaryKey({ columns: [t.playId, t.playerId] })],
);

// ---------------------------------------------------------------------------
// Opinions
// ---------------------------------------------------------------------------


export const opinion = sqliteTable(
  "opinion",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    sentiment: text("sentiment", { enum: SENTIMENTS }),
    /**
     * "Want to play": I'd like this on the table soon, played it or not (the planner
     * works out who'd need it taught). Cleared once they play it.
     */
    wantToPlay: integer("want_to_play", { mode: "boolean" }).notNull().default(false),
    /** When wantToPlay was turned on: only a play from then on clears it, not an old one imported later */
    wantToPlaySince: integer("want_to_play_since", { mode: "timestamp_ms" }),
    /** One of a member's few "I really want this on the table" votes; cleared once they play it */
    mustPlay: integer("must_play", { mode: "boolean" }).notNull().default(false),
    /** When mustPlay was turned on, as for wantToPlaySince */
    mustPlaySince: integer("must_play_since", { mode: "timestamp_ms" }),
    /** "Up for it on BGA". Online plays aren't logged, so nothing clears it. */
    playOnline: integer("play_online", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

/** A user's ordered list of favorites (position 0 = top). */
export const ranking = sqliteTable(
  "ranking",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

// ---------------------------------------------------------------------------
// Games we don't own yet
// ---------------------------------------------------------------------------

export const suggestion = sqliteTable(
  "suggestion",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bggId: integer("bgg_id"),
    name: text("name").notNull(),
    year: integer("year"),
    thumbnail: text("thumbnail"),
    reason: text("reason"),
    source: text("source", { enum: ["ai", "member"] }).notNull(),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    /** Claude ideas asked for one member ("For you"), not the whole group */
    forUserId: text("for_user_id").references(() => user.id, { onDelete: "set null" }),
    /** The night Claude picked it for, on the group's lists; null for one member's picks and members' ideas */
    night: text("night", { enum: NIGHTS }),
    dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("suggestion_name_idx").on(t.name)],
);

export const suggestionVote = sqliteTable(
  "suggestion_vote",
  {
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => suggestion.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
  },
  (t) => [primaryKey({ columns: [t.suggestionId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Planning: upcoming nights, and the games proposed, chosen or brought for each
// ---------------------------------------------------------------------------

/**
 * One core or casual night, upcoming or past: added on the site or with /event in Discord, and
 * posted to its events channel with a thread, or made when plays are logged for a date that
 * has none.
 */
export const gameNight = sqliteTable(
  "game_night",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    night: text("night", { enum: NIGHTS }).notNull(),
    /** Its post in Discord */
    url: text("url"),
    title: text("title").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    /** Its date in the group's time zone (YYYY-MM-DD): plays on this date and kind of night are this night's */
    date: text("date"),
    location: text("location"),
    /** People coming who aren't named, counted by hand */
    guests: integer("guests").notNull().default(0),
    /** Seats, when there's a limit */
    capacity: integer("capacity"),
    /** Cancelled here or in Discord */
    cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
    /** The channel its post is in, the post, and the post's thread */
    channelId: text("channel_id"),
    messageId: text("message_id"),
    threadId: text("thread_id"),
    /** A copy of its post's card in the thread, whose buttons work there (night-post.ts) */
    threadCardId: text("thread_card_id"),
    /** Its announcement in the group's chat channel, linking to the post (announce-post.ts) */
    announceChannelId: text("announce_channel_id"),
    announceMessageId: text("announce_message_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** When its channel got the reminder that it's starting soon; cleared when it moves */
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    /** When whoever made it was asked to log what was played */
    logNudgedAt: integer("log_nudged_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [index("game_night_starts_idx").on(t.startsAt), index("game_night_date_idx").on(t.night, t.date)],
);

/**
 * Who answered for a night, one row per person: on the site, or with the buttons on its post
 * in Discord. By player, so casual players without accounts can answer too.
 */
export const nightRsvp = sqliteTable(
  "night_rsvp",
  {
    gameNightId: integer("game_night_id")
      .notNull()
      .references(() => gameNight.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    status: text("status", { enum: RSVP_STATUSES }).notNull(),
    /** People they're bringing who aren't named */
    guests: integer("guests").notNull().default(0),
    via: text("via", { enum: ["site", "discord"] }).notNull(),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameNightId, t.playerId] })],
);

export type PrepLink = { label: string; url: string };

export const gamePlan = sqliteTable(
  "game_plan",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    /** Only a play on this night completes it */
    night: text("night", { enum: NIGHTS }).notNull().default("core"),
    /** The night it's for */
    gameNightId: integer("game_night_id").references(() => gameNight.id, { onDelete: "cascade" }),
    /** Core nights: the proposal that was locked in */
    chosen: integer("chosen", { mode: "boolean" }).notNull().default(false),
    /** Casual nights: who's bringing their copy */
    bringerId: text("bringer_id").references(() => user.id, { onDelete: "set null" }),
    /** Casual nights: someone who owns it was asked to bring it and hasn't answered */
    askedId: text("asked_id").references(() => user.id, { onDelete: "set null" }),
    /** Rules, teach videos, player aids people should look at beforehand */
    links: text("links", { mode: "json" }).$type<PrepLink[]>().notNull().default([]),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Set when a play of the game is logged */
    playedAt: integer("played_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [index("game_plan_game_idx").on(t.gameId), index("game_plan_night_idx").on(t.gameNightId)],
);

/** "I'd play this" for a game proposed for a core night; anyone can back any number */
export const planVote = sqliteTable(
  "plan_vote",
  {
    planId: integer("plan_id")
      .notNull()
      .references(() => gamePlan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
);

/** "I've done my prep" for a plan */
export const planReady = sqliteTable(
  "plan_ready",
  {
    planId: integer("plan_id")
      .notNull()
      .references(() => gamePlan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
);

/**
 * Finding a date before there's a night: a few dates posted to the core group's events channel
 * (with a thread) or offered on Plan, each voted on by whoever it works for. Picking one makes
 * the night, and the poll's post and thread become the night's.
 */
export const datePoll = sqliteTable("date_poll", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The kind of night it's finding a date for; only the core group's so far */
  night: text("night", { enum: NIGHTS }).notNull().default("core"),
  /** What the night will be called; empty for the usual title with its date */
  title: text("title"),
  location: text("location"),
  status: text("status", { enum: POLL_STATUSES }).notNull().default("open"),
  /** The night it became, once a date was picked */
  gameNightId: integer("game_night_id").references(() => gameNight.id, { onDelete: "set null" }),
  /** Its post in Discord, the channel and the post's thread, as for a night */
  channelId: text("channel_id"),
  messageId: text("message_id"),
  threadId: text("thread_id"),
  threadCardId: text("thread_card_id"),
  /** Its announcement in the group's chat channel, which becomes the night's once a date's picked */
  announceChannelId: text("announce_channel_id"),
  announceMessageId: text("announce_message_id"),
  url: text("url"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/** One date and time a poll offers */
export const datePollOption = sqliteTable(
  "date_poll_option",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => datePoll.id, { onDelete: "cascade" }),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (t) => [index("date_poll_option_poll_idx").on(t.pollId)],
);

/** "Works for me" on one of a poll's dates. By player, like answers for a night, so Discord's buttons work without an account. */
export const datePollVote = sqliteTable(
  "date_poll_vote",
  {
    optionId: integer("option_id")
      .notNull()
      .references(() => datePollOption.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    votedAt: integer("voted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.playerId] })],
);

// ---------------------------------------------------------------------------
// Discovery: well-regarded and trending games nobody may own yet, refreshed from BGG
// ---------------------------------------------------------------------------

export const catalogGame = sqliteTable("catalog_game", {
  gameId: integer("game_id")
    .primaryKey()
    .references(() => game.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["hot", "top"] }).notNull(),
  /** Position in BGG's hot list, or in our curated list */
  position: integer("position").notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Board Game Arena: which games can be played there, refreshed nightly from its game list
// ---------------------------------------------------------------------------

/**
 * One row per BGA game. Several can share a BGG id (rule variants of one card game),
 * and `bggId` isn't a foreign key: most BGA games aren't in our `game` table.
 */
export const bgaGame = sqliteTable(
  "bga_game",
  {
    id: integer("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    bggId: integer("bgg_id"),
    premium: integer("premium", { mode: "boolean" }).notNull(),
    playerCounts: text("player_counts", { mode: "json" }).$type<number[]>().notNull(),
    averageDuration: integer("average_duration"),
    realtime: integer("realtime", { mode: "boolean" }).notNull(),
    turnBased: integer("turn_based", { mode: "boolean" }).notNull(),
    beta: integer("beta", { mode: "boolean" }).notNull(),
    gamesPlayed: integer("games_played").notNull(),
    ...timestamps,
  },
  (t) => [index("bga_game_bgg_idx").on(t.bggId)],
);

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

/** The group's settings, set by its admins on the site (src/lib/settings.ts). A JSON value per key */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  ...timestamps,
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  ...timestamps,
});
