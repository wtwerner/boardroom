import "server-only";
import { and, eq, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import type { Night } from "@/db/enums";
import { hasAnthropicKey, parsePlayWithClaude } from "./ai";
import {
  type BggCollectionEntry,
  type BggGameDetails,
  fetchCollection,
  fetchGameDetails,
  hasBggToken,
  mergeCollectionEntries,
  parseCollectionCsv,
  searchGames,
} from "./bgg";
import { fetchBgaGames } from "./bga";
import { type DiscordMessage, compareSnowflakes, fetchChannelMessagesAfter, playsChannel, snowflakeAt } from "./discord";
import { componentText } from "./discord-message";
import { nightTitle, zonedToUtc } from "./nights";
import { matchByName } from "./players";
import { type ParsedPlay, type ParsedPlayer, parsePlayMessage, toLocalDate } from "./play-parser";

/** Sync state keys per night; the core channel's keep the names they had before there were two */
const stateKey = (night: Night, key: string) => (night === "core" ? `discord:${key}` : `discord:${night}:${key}`);
const DISCORD_CURSOR = stateKey("core", "last_message_id");
/**
 * Bump when the parser learns to read posts it used to misread: the next sync then
 * re-reads the whole channel once and fixes the plays it imported from them.
 * 2: "🎲: [A](…) + [B](…)" nights, which were imported as just A.
 * 3: games listed one per line under "🎲:", and "<@1> <@2> +Guest" player lines.
 */
const PARSER_VERSION = "3";
/** Posts edited within this many days are re-read on every sync, e.g. to add a game */
const EDIT_WINDOW_DAYS = 14;

export type SyncResult = { imported: number; needsReview: number; corrected: number; skipped: number };

/** Reads the core group's plays channel, then the casual night's when it's configured. */
export async function syncDiscordPlays(): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, needsReview: 0, corrected: 0, skipped: 0 };
  await syncChannel("core", result);
  if (playsChannel("casual")) await syncChannel("casual", result);
  return result;
}

async function syncChannel(night: Night, result: SyncResult) {
  const cursorKey = stateKey(night, "last_message_id");
  const versionKey = stateKey(night, "parser_version");
  const cursor = await getState(cursorKey);
  const reread = cursor !== null && (await getState(versionKey)) !== PARSER_VERSION;
  const recent = snowflakeAt(Date.now() - EDIT_WINDOW_DAYS * 86_400_000);
  const from = cursor === null || reread ? "0" : compareSnowflakes({ id: cursor }, { id: recent }) < 0 ? cursor : recent;
  const channelId = playsChannel(night);
  if (!channelId) throw new Error("DISCORD_PLAYS_CHANNEL_ID is not set");
  const messages = await fetchChannelMessagesAfter(channelId, from);

  for (const msg of messages) {
    if (cursor !== null && compareSnowflakes(msg, { id: cursor }) <= 0) {
      // Seen before: only worth another look after a parser fix, or when someone edited it
      if (reread || msg.edited_timestamp) await reconcileMessage(msg, night, result);
      continue;
    }
    const plays = await parseMessage(msg);
    if (!plays) {
      result.skipped++;
    } else {
      for (const [i, p] of plays.entries()) {
        const { status } = await savePlay(p, { source: "discord", sourceRef: `${msg.id}:${i}`, night });
        if (status === "saved") result.imported++;
        if (status === "needs-review") result.needsReview++;
      }
    }
    // Advance per message so a timeout mid-import resumes where it stopped
    await setState(cursorKey, msg.id);
  }
  if (cursor === null || reread) await setState(versionKey, PARSER_VERSION);
}

/**
 * Bring the plays imported from a post in line with what it says now: a game added in
 * an edit, or "A + B" that an older parser read as just A. Posts that never gave a
 * play are left alone, as are plays someone deleted. Only the template parser is
 * used here, so re-reading never sends old posts to Claude.
 */
async function reconcileMessage(msg: DiscordMessage, night: Night, result: SyncResult) {
  // The app's own posts are written from the database, not the other way round
  if (msg.author.bot) return;
  const existing = await db
    .select({ id: schema.play.id, sourceRef: schema.play.sourceRef, gameId: schema.play.gameId, gameName: schema.play.gameName, night: schema.play.night })
    .from(schema.play)
    .where(and(eq(schema.play.source, "discord"), like(schema.play.sourceRef, `${msg.id}:%`)));
  if (existing.length === 0) return;
  const parsed = parsePlayMessage({ content: msg.content, timestamp: msg.timestamp, mentions: msg.mentions, timeZone: TIME_ZONE });
  if (!parsed) return;

  const byRef = new Map(existing.map((e) => [e.sourceRef, e]));
  for (const [i, p] of parsed.entries()) {
    const ref = `${msg.id}:${i}`;
    const current = byRef.get(ref);
    if (!current) {
      if (await getState(deletedKey(ref))) continue;
      const { status } = await savePlay(p, { source: "discord", sourceRef: ref, night });
      if (status === "saved") result.imported++;
      if (status === "needs-review") result.needsReview++;
    } else if (p.bggId ? current.gameId !== p.bggId : normalizeTitle(current.gameName) !== normalizeTitle(p.gameName)) {
      const gameId = p.bggId ? await ensureGame(p.bggId, p.gameName) : await resolveGame(p.gameName);
      await db
        .update(schema.play)
        .set({ gameId, gameName: p.gameName, needsReview: gameId === null })
        .where(eq(schema.play.id, current.id));
      await afterPlaySaved(current.id, gameId, p.playedOn, current.night);
      result.corrected++;
    }
  }
}

const deletedKey = (sourceRef: string) => `discord:deleted:${sourceRef}`;

/** Plays deleted from Discord posts stay deleted when those posts are read again. */
export async function rememberDeletedDiscordPlays(sourceRefs: (string | null)[]) {
  for (const ref of sourceRefs) if (ref) await setState(deletedKey(ref), "1");
}

async function parseMessage(msg: DiscordMessage): Promise<ParsedPlay[] | null> {
  const content = msg.content.trim() || componentText(msg.components);
  if (!content.trim()) return null;
  const parsed = parsePlayMessage({
    content,
    timestamp: msg.timestamp,
    mentions: msg.mentions,
    timeZone: TIME_ZONE,
  });
  if (parsed) return parsed;
  if (!hasAnthropicKey()) return null;
  return parsePlayWithClaude(content, toLocalDate(msg.timestamp, TIME_ZONE));
}

type SaveOpts = { source: "discord" | "manual"; sourceRef?: string; createdBy?: string; gameId?: number; night?: Night };

export async function savePlay(
  p: ParsedPlay,
  opts: SaveOpts,
): Promise<{ status: "saved" | "needs-review" | "duplicate"; playId: number }> {
  if (opts.sourceRef) {
    const existing = await db.query.play.findFirst({ where: eq(schema.play.sourceRef, opts.sourceRef) });
    if (existing) return { status: "duplicate", playId: existing.id };
  }

  const gameId = opts.gameId ?? (p.bggId ? await ensureGame(p.bggId, p.gameName) : await resolveGame(p.gameName));
  const night = opts.night ?? "core";

  // Someone logged it here and someone else also posted it in Discord by hand, or it was
  // posted in both nights' channels. (Two posts in one channel can be two real plays.)
  if (opts.source === "discord" && gameId !== null) {
    const twin = await db.query.play.findFirst({
      where: and(
        eq(schema.play.gameId, gameId),
        eq(schema.play.playedOn, p.playedOn),
        or(eq(schema.play.source, "manual"), ne(schema.play.night, night)),
      ),
      columns: { id: true },
    });
    if (twin) return { status: "duplicate", playId: twin.id };
  }

  const [row] = await db
    .insert(schema.play)
    .values({
      gameId,
      gameName: p.gameName,
      playedOn: p.playedOn,
      location: p.location,
      notes: p.notes,
      source: opts.source,
      night,
      sourceRef: opts.sourceRef,
      createdBy: opts.createdBy,
      needsReview: gameId === null,
    })
    .returning({ id: schema.play.id });

  await seatPlayers(row.id, p.players);
  await afterPlaySaved(row.id, gameId, p.playedOn, night);
  return { status: gameId === null ? "needs-review" : "saved", playId: row.id };
}

/** Overwrite a logged play with corrected details and players. */
export async function replacePlay(playId: number, p: ParsedPlay, gameId: number, night: Night) {
  await db
    .update(schema.play)
    .set({ gameId, gameName: p.gameName, playedOn: p.playedOn, location: p.location ?? null, notes: p.notes ?? null, night, needsReview: false })
    .where(eq(schema.play.id, playId));
  await db.delete(schema.playPlayer).where(eq(schema.playPlayer.playId, playId));
  await seatPlayers(playId, p.players);
  await afterPlaySaved(playId, gameId, p.playedOn, night);
}

async function seatPlayers(playId: number, players: ParsedPlayer[]) {
  for (const pl of players) {
    const { playerId, ambiguousName } = await resolvePlayer(pl);
    await db.insert(schema.playPlayer).values({ playId, playerId, ambiguousName }).onConflictDoNothing();
  }
}

/**
 * A play of a game clears its players' must-play and want-to-play votes, whichever night
 * they played it on, and completes the plan for it on that night. Its night gets a page
 * if it didn't have one.
 */
async function afterPlaySaved(playId: number, gameId: number | null, playedOn: string, night: Night) {
  const saved = await db.query.play.findFirst({ where: eq(schema.play.id, playId), columns: { location: true } });
  await ensureNight(night, playedOn, saved?.location ?? null);
  if (gameId === null) return;
  await spendVotes(gameId, playId, playedOn);
  await db
    .update(schema.gamePlan)
    .set({ playedAt: new Date() })
    .where(
      and(
        eq(schema.gamePlan.gameId, gameId),
        eq(schema.gamePlan.night, night),
        isNull(schema.gamePlan.playedAt),
        lte(schema.gamePlan.createdAt, new Date(`${playedOn}T23:59:59Z`)),
      ),
    );
}

/**
 * The night plays on this date belong to, made if there isn't one yet (a night nobody added
 * ahead, or from before the group used Boardroom). Starts at 7pm, the usual time.
 */
async function ensureNight(night: Night, date: string, location: string | null) {
  const existing = await db.query.gameNight.findFirst({ where: and(eq(schema.gameNight.night, night), eq(schema.gameNight.date, date)) });
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.gameNight)
    .values({ night, date, title: nightTitle(night, date), startsAt: zonedToUtc(date, "19:00", TIME_ZONE), location })
    .returning({ id: schema.gameNight.id });
  return row.id;
}

/**
 * Members who were at this play got their wish: their must-play vote comes back and
 * "want to play" is cleared, so its counts are about what people want next. Only
 * votes cast before the night count; an old play imported or corrected later
 * leaves today's votes alone. (Logged live, the cut-off is now; otherwise the end
 * of the day after, which allows for time zones and logging the next morning.)
 */
async function spendVotes(gameId: number, playId: number, playedOn: string) {
  const cutoff = Math.min(Date.now(), Date.parse(`${playedOn}T23:59:59Z`) + 86_400_000);
  const atThePlay = sql`user_id in (
    select p.user_id from play_player pp join player p on p.id = pp.player_id
    where pp.play_id = ${playId} and p.user_id is not null)`;
  await db.run(sql`
    update opinion set must_play = 0, must_play_since = null
    where game_id = ${gameId} and must_play = 1 and coalesce(must_play_since, 0) <= ${cutoff} and ${atThePlay}`);
  await db.run(sql`
    update opinion set want_to_play = 0, want_to_play_since = null
    where game_id = ${gameId} and want_to_play = 1 and coalesce(want_to_play_since, 0) <= ${cutoff} and ${atThePlay}`);
}

/** A play of the same game on the same day, on either night. */
export async function findSamePlay(gameId: number, playedOn: string) {
  return db.query.play.findFirst({
    where: and(eq(schema.play.gameId, gameId), eq(schema.play.playedOn, playedOn)),
    columns: { id: true, source: true },
  });
}

/** Make sure a linked BGG id has a game row (full details when we have a token). */
export async function ensureGame(bggId: number, fallbackName: string) {
  const existing = await db.query.game.findFirst({ where: eq(schema.game.id, bggId), columns: { id: true } });
  if (existing) return bggId;
  if (hasBggToken()) {
    try {
      const details = await fetchGameDetails([bggId]);
      if (details.length) {
        await upsertGameDetails(details);
        return bggId;
      }
    } catch (err) {
      console.error(`BGG details failed for ${bggId}`, err);
    }
  }
  await db.insert(schema.game).values({ id: bggId, name: fallbackName }).onConflictDoNothing();
  return bggId;
}

export const normalizeTitle = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Match a logged game name to a BGG id: an earlier play that was already
 * matched (so fixing one review fixes the rest), then the shared shelf,
 * then a BGG search.
 */
async function resolveGame(name: string): Promise<number | null> {
  const key = normalizeTitle(name);

  const previous = await db
    .select({ gameId: schema.play.gameId, gameName: schema.play.gameName })
    .from(schema.play)
    .where(isNotNull(schema.play.gameId));
  const fromPlays = previous.find((p) => normalizeTitle(p.gameName) === key);
  if (fromPlays?.gameId) return fromPlays.gameId;

  const games = await db.select({ id: schema.game.id, name: schema.game.name }).from(schema.game);
  const fromShelf =
    games.find((g) => normalizeTitle(g.name) === key) ??
    // "Root" logged for "Root: A Game of Woodland Might and Right"
    games.find((g) => normalizeTitle(g.name.split(":")[0]) === key);
  if (fromShelf) return fromShelf.id;

  if (!hasBggToken()) return null;
  try {
    const [hit] = await searchGames(name);
    if (!hit) return null;
    const [details] = await fetchGameDetails([hit.id]);
    if (details) await upsertGameDetails([details]);
    return hit.id;
  } catch (err) {
    console.error(`BGG search failed for "${name}"`, err);
    return null;
  }
}

/**
 * Who a name in a play log is. A player picked on the site or an @-mention is exact; a plain
 * name is matched with `matchByName`, leaving out players tied to a different Discord account.
 * A name two players share isn't guessed: the likeliest is seated, with the name kept so
 * someone can say which.
 */
async function resolvePlayer(p: ParsedPlayer): Promise<{ playerId: number; ambiguousName: string | null }> {
  if (p.playerId) return { playerId: p.playerId, ambiguousName: null };
  const players = await db.select().from(schema.player);

  if (p.discordId) {
    const byDiscord = players.find((pl) => pl.discordId === p.discordId);
    if (byDiscord) return { playerId: byDiscord.id, ambiguousName: null };
  }

  // A name match that's already tied to a *different* Discord account is a different person
  const match = matchByName(
    players.filter((pl) => !(p.discordId && pl.discordId && pl.discordId !== p.discordId)),
    p.name,
  );
  if (match && "ambiguous" in match) return { playerId: match.ambiguous[0].id, ambiguousName: p.name.trim() };
  if (match) {
    if (p.discordId && !match.player.discordId) {
      await db.update(schema.player).set({ discordId: p.discordId }).where(eq(schema.player.id, match.player.id));
    }
    return { playerId: match.player.id, ambiguousName: null };
  }

  const [created] = await db
    .insert(schema.player)
    .values({ name: p.name.trim(), discordId: p.discordId })
    .returning({ id: schema.player.id });
  return { playerId: created.id, ambiguousName: null };
}

// ---------------------------------------------------------------------------
// BGG → shelf
// ---------------------------------------------------------------------------

export async function syncBggCollections(): Promise<{ users: number; games: number; detailed: number }> {
  const users = await db
    .select({ id: schema.user.id, bggUsername: schema.user.bggUsername })
    .from(schema.user)
    .where(isNotNull(schema.user.bggUsername));

  let games = 0;
  for (const u of users) {
    games += (await syncUserCollection(u.id, u.bggUsername!)).length;
  }
  const detailed = await refreshStaleGameDetails();
  return { users: users.length, games, detailed };
}

export async function syncUserCollection(userId: string, username: string) {
  const entries = await fetchCollection(username);
  await replaceCollection(userId, entries);
  return entries;
}

export async function importCollectionCsv(userId: string, csv: string) {
  const { entries, details } = parseCollectionCsv(csv);
  if (entries.length === 0) throw new Error("No games found — is this BGG's collection CSV export?");
  // Only fill details we don't already have from the API (which has images)
  const known = new Set(
    (
      await db
        .select({ id: schema.game.id })
        .from(schema.game)
        .where(and(inArray(schema.game.id, details.map((d) => d.id)), isNotNull(schema.game.detailsFetchedAt)))
    ).map((g) => g.id),
  );
  await upsertGameDetails(details.filter((d) => !known.has(d.id)), { markFetched: false });
  await replaceCollection(userId, entries);
  return entries.length;
}

async function replaceCollection(userId: string, all: BggCollectionEntry[]) {
  const entries = mergeCollectionEntries(all);
  for (const e of entries) {
    await db
      .insert(schema.game)
      .values({ id: e.id, name: e.name, year: e.year, thumbnail: e.thumbnail, image: e.image })
      .onConflictDoUpdate({
        target: schema.game.id,
        set: {
          name: e.name,
          ...(e.thumbnail ? { thumbnail: e.thumbnail, image: e.image } : {}),
        },
      });
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.collectionItem).where(eq(schema.collectionItem.userId, userId));
    if (entries.length === 0) return;
    await tx.insert(schema.collectionItem).values(
      entries.map((e) => ({
        userId,
        gameId: e.id,
        own: e.own,
        wishlist: e.wishlist,
        wantToPlay: e.wantToPlay,
        prevOwned: e.prevOwned,
        bggUserRating: e.userRating,
      })),
    );
  });
}

/** Pull full /thing details for games we've never detailed or haven't refreshed in 30 days. */
export async function refreshStaleGameDetails(limit = 60) {
  if (!hasBggToken()) return 0;
  const stale = await db
    .select({ id: schema.game.id })
    .from(schema.game)
    .where(
      or(
        isNull(schema.game.detailsFetchedAt),
        lt(schema.game.detailsFetchedAt, new Date(Date.now() - 30 * 86_400_000)),
      ),
    )
    .limit(limit);
  if (stale.length === 0) return 0;
  const details = await fetchGameDetails(stale.map((g) => g.id));
  await upsertGameDetails(details);
  return details.length;
}

export async function upsertGameDetails(details: BggGameDetails[], { markFetched = true } = {}) {
  for (const d of details) {
    const values = {
      name: d.name,
      year: d.year,
      minPlayers: d.minPlayers,
      maxPlayers: d.maxPlayers,
      bestPlayers: d.bestPlayers,
      minPlaytime: d.minPlaytime,
      maxPlaytime: d.maxPlaytime,
      weight: d.weight,
      bggRating: d.bggRating,
      bggRank: d.bggRank,
      ...(d.thumbnail ? { thumbnail: d.thumbnail, image: d.image } : {}),
      ...(d.categories.length ? { categories: d.categories, mechanics: d.mechanics } : {}),
      ...(d.description ? { description: d.description } : {}),
      ...(markFetched ? { detailsFetchedAt: new Date() } : {}),
    };
    await db
      .insert(schema.game)
      .values({ id: d.id, ...values })
      .onConflictDoUpdate({ target: schema.game.id, set: values });
  }
}

// ---------------------------------------------------------------------------
// Board Game Arena
// ---------------------------------------------------------------------------

export const BGA_SYNC_KEY = "bga:games";

/** Replace the BGA game list with a fresh copy. A page that parses to almost nothing is refused rather than wiping it. */
export async function syncBgaGames() {
  const games = await fetchBgaGames();
  if (games.length < 200) throw new Error(`BGA's game list only had ${games.length} games; keeping the old list`);
  await db.transaction(async (tx) => {
    await tx.delete(schema.bgaGame);
    for (let i = 0; i < games.length; i += 200) await tx.insert(schema.bgaGame).values(games.slice(i, i + 200));
  });
  await setState(BGA_SYNC_KEY, String(games.length));
  return { games: games.length, onBgg: games.filter((g) => g.bggId).length };
}

// ---------------------------------------------------------------------------

async function getState(key: string) {
  const row = await db.query.syncState.findFirst({ where: eq(schema.syncState.key, key) });
  return row?.value ?? null;
}

async function setState(key: string, value: string) {
  await db
    .insert(schema.syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: sql`(unixepoch() * 1000)` } });
}

export async function lastSyncedAt(key = DISCORD_CURSOR) {
  const row = await db.query.syncState.findFirst({ where: eq(schema.syncState.key, key) });
  return row?.updatedAt ?? null;
}
