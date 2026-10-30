import "server-only";
import { and, count, countDistinct, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { MUST_PLAY_LIMIT, TIERS, type MeepleColor, type Night, type Sentiment, type Tier } from "@/db/enums";
import { localDate, recentMonths } from "./nights";
import { playOrder } from "./log-post";
import { matchByName, playerLabels } from "./players";
import { groupRanking } from "./ranking";
import { rankLists } from "./setup";
import { gameTier } from "./tier";

const { game, play, playPlayer, player, collectionItem, opinion, ranking, user } = schema;

export type Person = {
  id: number;
  name: string;
  color: MeepleColor | null;
  userId: string | null;
  discordId: string | null;
  image: string | null;
  /** Their name, told apart from anyone else with it ("Lee (since Sep 2025)") */
  label: string;
};

export async function getPlayers(): Promise<Person[]> {
  const rows = await db
    .select({
      id: player.id,
      name: player.name,
      color: player.color,
      userId: player.userId,
      discordId: player.discordId,
      image: user.image,
      firstPlayed: sql<string | null>`(select min(${play.playedOn}) from ${play} join ${playPlayer} on ${playPlayer.playId} = ${play.id} where ${playPlayer.playerId} = ${player.id})`,
    })
    .from(player)
    .leftJoin(user, eq(user.id, player.userId))
    .orderBy(sql`${player.userId} is null`, player.name);
  const labels = playerLabels(rows);
  return rows.map((p) => ({ id: p.id, name: p.name, color: p.color, userId: p.userId, discordId: p.discordId, image: p.image, label: labels.get(p.id)! }));
}

export async function getMembers() {
  return db
    .select({ id: user.id, name: user.name, image: user.image, color: player.color, playerId: player.id })
    .from(user)
    .leftJoin(player, eq(player.userId, user.id))
    .orderBy(user.name);
}

// ---------------------------------------------------------------------------
// Dashboard: both nights, told apart
// ---------------------------------------------------------------------------

/** Plays on one night only, for counting it beside the other */
const on = (night: Night) => sql`case when ${play.night} = ${night} then ${play.id} end`;
/** A game night is a date on one of the two nights */
const nightOn = (night: Night) => sql`case when ${play.night} = ${night} then ${play.playedOn} end`;

export async function getHeadlineStats() {
  // The group's year, not the server's: on New Year's Eve evening UTC is already next year
  const year = localDate(new Date()).slice(0, 4);
  const counts = {
    plays: count(),
    core: count(on("core")),
    casual: count(on("casual")),
    coreNights: countDistinct(nightOn("core")),
    casualNights: countDistinct(nightOn("casual")),
  };
  const [[all], [thisYear]] = await Promise.all([
    db.select({ ...counts, games: countDistinct(play.gameName) }).from(play),
    db.select(counts).from(play).where(sql`substr(${play.playedOn}, 1, 4) = ${year}`),
  ]);
  return { all, thisYear, year };
}

export type PlayRow = Awaited<ReturnType<typeof getPlays>>[number];

/** Plays with their game and seated players, newest first. */
export async function getPlays(opts: { limit?: number; offset?: number; gameId?: number; date?: string; night?: Night } = {}) {
  const rows = await db
    .select({
      id: play.id,
      playedOn: play.playedOn,
      gameId: play.gameId,
      gameName: play.gameName,
      location: play.location,
      notes: play.notes,
      source: play.source,
      sourceRef: play.sourceRef,
      night: play.night,
      needsReview: play.needsReview,
      thumbnail: game.thumbnail,
      image: game.image,
      title: game.name,
    })
    .from(play)
    .leftJoin(game, eq(game.id, play.gameId))
    .where(
      and(
        opts.gameId ? eq(play.gameId, opts.gameId) : undefined,
        opts.date ? eq(play.playedOn, opts.date) : undefined,
        opts.night ? eq(play.night, opts.night) : undefined,
      ),
    )
    // A night's games in the order they were played
    .orderBy(desc(play.playedOn), playOrder)
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  const seats = rows.length
    ? await db
        .select({
          playId: playPlayer.playId,
          playerId: player.id,
          name: player.name,
          color: player.color,
        })
        .from(playPlayer)
        .innerJoin(player, eq(player.id, playPlayer.playerId))
        .where(inArray(playPlayer.playId, rows.map((r) => r.id)))
    : [];

  return rows.map((r) => ({
    ...r,
    name: r.title ?? r.gameName,
    players: seats.filter((s) => s.playId === r.id),
  }));
}

/** The latest night anything was played, of either kind; of two on one day, the one logged last */
export async function getLastNight() {
  const [latest] = await db.select({ day: play.playedOn, night: play.night }).from(play).orderBy(desc(play.playedOn), desc(play.id)).limit(1);
  if (!latest) return null;
  return { date: latest.day, night: latest.night, plays: await getPlays({ date: latest.day, night: latest.night, limit: 20 }) };
}

export async function getMostPlayed(limit = 8) {
  return db
    .select({
      id: game.id,
      name: game.name,
      thumbnail: game.thumbnail,
      image: game.image,
      plays: count(play.id),
      core: count(on("core")),
      casual: count(on("casual")),
      lastPlayed: max(play.playedOn),
    })
    .from(play)
    .innerJoin(game, eq(game.id, play.gameId))
    .groupBy(game.id)
    .orderBy(desc(count(play.id)), desc(max(play.playedOn)))
    .limit(limit);
}

/** Game nights attended per person (a night = a distinct date), on one kind of night or both. */
export async function getAttendance(night?: Night) {
  const rows = await db
    .select({
      id: player.id,
      name: player.name,
      color: player.color,
      userId: player.userId,
      nights: countDistinct(play.playedOn),
      coreNights: countDistinct(nightOn("core")),
      casualNights: countDistinct(nightOn("casual")),
      plays: count(play.id),
    })
    .from(playPlayer)
    .innerJoin(player, eq(player.id, playPlayer.playerId))
    .innerJoin(play, eq(play.id, playPlayer.playId))
    .where(night ? eq(play.night, night) : undefined)
    .groupBy(player.id)
    .orderBy(desc(countDistinct(play.playedOn)));
  return rows;
}

/** Play counts on each night for the last 12 calendar months in the group's time zone, oldest first. */
export async function getPlaysByMonth() {
  const rows = await db
    .select({ month: sql<string>`substr(${play.playedOn}, 1, 7)`, core: count(on("core")), casual: count(on("casual")) })
    .from(play)
    .groupBy(sql`substr(${play.playedOn}, 1, 7)`);
  const counts = new Map(rows.map((r) => [r.month, r]));
  return recentMonths(localDate(new Date())).map((month) => {
    const c = counts.get(month);
    return { month, core: c?.core ?? 0, casual: c?.casual ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Shelf
// ---------------------------------------------------------------------------

export type ShelfGame = Awaited<ReturnType<typeof getShelf>>[number];

/**
 * Every game someone owns, with who owns it and how the group feels about it. Its plays
 * and last play are on either night, or just one when `night` is given (for planning that night).
 */
export async function getShelf(opts: { night?: Night } = {}) {
  const games = await db
    .selectDistinct({
      id: game.id,
      name: game.name,
      year: game.year,
      thumbnail: game.thumbnail,
      image: game.image,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      bestPlayers: game.bestPlayers,
      minPlaytime: game.minPlaytime,
      maxPlaytime: game.maxPlaytime,
      weight: game.weight,
      tier: game.tier,
      bggRating: game.bggRating,
      mechanics: game.mechanics,
    })
    .from(game)
    .innerJoin(collectionItem, and(eq(collectionItem.gameId, game.id), eq(collectionItem.own, true)))
    .orderBy(game.name);

  const [owners, plays, opinions] = await Promise.all([
    db
      .select({ gameId: collectionItem.gameId, userId: collectionItem.userId })
      .from(collectionItem)
      .where(eq(collectionItem.own, true)),
    db
      .select({ gameId: play.gameId, plays: count(), lastPlayed: max(play.playedOn) })
      .from(play)
      .where(and(isNotNull(play.gameId), opts.night ? eq(play.night, opts.night) : undefined))
      .groupBy(play.gameId),
    db.select().from(opinion),
  ]);

  const playMap = new Map(plays.map((p) => [p.gameId, p]));
  return games.map((g) => ({
    ...g,
    ownerIds: owners.filter((o) => o.gameId === g.id).map((o) => o.userId),
    plays: playMap.get(g.id)?.plays ?? 0,
    lastPlayed: playMap.get(g.id)?.lastPlayed ?? null,
    sentiments: opinions
      .filter((o) => o.gameId === g.id && o.sentiment)
      .map((o) => ({ userId: o.userId, sentiment: o.sentiment as Sentiment })),
    wantToPlay: opinions.filter((o) => o.gameId === g.id && o.wantToPlay).map((o) => o.userId),
    mustPlay: opinions.filter((o) => o.gameId === g.id && o.mustPlay).map((o) => o.userId),
  }));
}

export async function getWantToPlay(limit = 6) {
  const shelf = await getShelf();
  return shelf
    .filter((g) => g.wantToPlay.length > 0 || g.mustPlay.length > 0)
    // A must-play is one person's strong wish, so it leads but is shown apart from the want-to-play count
    .sort((a, b) => b.mustPlay.length - a.mustPlay.length || b.wantToPlay.length - a.wantToPlay.length)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export type RankingLists = Record<string, number[]>;

/**
 * Everyone's rankings, best first, split by tier (tier.ts): a game is only ever compared with
 * games of its own tier, so each tier's lists are what positions and shares are counted in.
 */
export async function getTieredRankingLists(): Promise<Record<Tier, RankingLists>> {
  const rows = await db
    .select({ userId: ranking.userId, gameId: ranking.gameId, weight: game.weight, tier: game.tier })
    .from(ranking)
    .innerJoin(game, eq(game.id, ranking.gameId))
    .orderBy(ranking.userId, ranking.position);
  const lists: Record<Tier, RankingLists> = { heavy: {}, light: {} };
  for (const r of rows) (lists[gameTier(r)][r.userId] ??= []).push(r.gameId);
  return lists;
}

export async function getRankingLists(tier: Tier) {
  return (await getTieredRankingLists())[tier];
}

/** Each game's tier, for the games given */
export async function getGameTiers(ids: number[]) {
  if (ids.length === 0) return new Map<number, Tier>();
  const rows = await db.select({ id: game.id, weight: game.weight, tier: game.tier }).from(game).where(inArray(game.id, ids));
  return new Map(rows.map((r) => [r.id, gameTier(r)]));
}

export async function getGroupRanking(tier: Tier, limit?: number) {
  const ranked = groupRanking(await getRankingLists(tier));
  const top = limit ? ranked.slice(0, limit) : ranked;
  if (top.length === 0) return [];
  const games = await db
    .select({ id: game.id, name: game.name, thumbnail: game.thumbnail })
    .from(game)
    .where(inArray(game.id, top.map((r) => r.gameId)));
  const byId = new Map(games.map((g) => [g.id, g]));
  return top.map((r) => ({ ...r, game: byId.get(r.gameId)! })).filter((r) => r.game);
}

/**
 * What a member ranks in one tier: every game of it they've played, on either night (most
 * played first, which is also the order they're asked to place them), plus anything already
 * in their list from before.
 */
export async function getRankingPool(userId: string, playerId: number | null, rankedIds: number[], tier: Tier) {
  const { played } = await getRateableGames(userId, playerId);
  const tiers = await getGameTiers(played.map((g) => g.id));
  const inTier = played.filter((g) => tiers.get(g.id) === tier);
  const playedIds = new Set(inTier.map((g) => g.id));
  const extra = rankedIds.filter((id) => !playedIds.has(id));
  const others = extra.length
    ? await db.select({ id: game.id, name: game.name, thumbnail: game.thumbnail, image: game.image }).from(game).where(inArray(game.id, extra))
    : [];
  return [
    ...inTier.map((g) => ({ id: g.id, name: g.name, thumbnail: g.thumbnail, image: g.image, plays: g.plays })),
    ...others.map((g) => ({ ...g, plays: 0 })),
  ];
}

// ---------------------------------------------------------------------------
// Single game
// ---------------------------------------------------------------------------

export async function getGame(id: number) {
  const [g, owners, opinions, plays] = await Promise.all([
    db.query.game.findFirst({ where: eq(game.id, id) }),
    db
      .select({ userId: user.id, name: user.name, own: collectionItem.own, wishlist: collectionItem.wishlist, rating: collectionItem.bggUserRating })
      .from(collectionItem)
      .innerJoin(user, eq(user.id, collectionItem.userId))
      .where(eq(collectionItem.gameId, id)),
    db
      .select({ userId: opinion.userId, sentiment: opinion.sentiment, wantToPlay: opinion.wantToPlay, mustPlay: opinion.mustPlay, playOnline: opinion.playOnline })
      .from(opinion)
      .where(eq(opinion.gameId, id)),
    getPlays({ gameId: id, limit: 200 }),
  ]);
  if (!g) return null;
  return { game: g, owners, opinions, plays };
}

/** Must-play votes a member has free, ignoring the one on `exceptGameId` (if any). */
export async function getMustPlayLeft(userId: string, exceptGameId?: number) {
  const [held] = await db
    .select({ n: count() })
    .from(opinion)
    .where(and(eq(opinion.userId, userId), eq(opinion.mustPlay, true), exceptGameId ? sql`${opinion.gameId} != ${exceptGameId}` : undefined));
  return Math.max(0, MUST_PLAY_LIMIT - held.n);
}

async function getMyOpinions(userId: string) {
  const rows = await db.select().from(opinion).where(eq(opinion.userId, userId));
  return new Map(rows.map((r) => [r.gameId, r]));
}

/** For each game, the members who've played it with the group. */
export async function getPlayedBy() {
  const rows = await db
    .selectDistinct({ gameId: play.gameId, userId: player.userId })
    .from(playPlayer)
    .innerJoin(play, eq(play.id, playPlayer.playId))
    .innerJoin(player, eq(player.id, playPlayer.playerId))
    .where(and(isNotNull(play.gameId), isNotNull(player.userId)));
  const byGame = new Map<number, string[]>();
  for (const r of rows) byGame.set(r.gameId!, [...(byGame.get(r.gameId!) ?? []), r.userId!]);
  return byGame;
}

/** Games I've played (most played first), then shelf games I haven't, each with my opinion. */
export async function getRateableGames(userId: string, playerId: number | null) {
  const [played, shelf, mine] = await Promise.all([
    db
      .select({ id: game.id, name: game.name, thumbnail: game.thumbnail, image: game.image, plays: count(play.id), lastPlayed: max(play.playedOn) })
      .from(playPlayer)
      .innerJoin(play, eq(play.id, playPlayer.playId))
      .innerJoin(game, eq(game.id, play.gameId))
      .where(eq(playPlayer.playerId, playerId ?? -1))
      .groupBy(game.id)
      .orderBy(desc(count(play.id)), game.name),
    db
      .select({ id: game.id, name: game.name, thumbnail: game.thumbnail, owners: sql<string>`group_concat(${user.name}, ', ')` })
      .from(game)
      .innerJoin(collectionItem, and(eq(collectionItem.gameId, game.id), eq(collectionItem.own, true)))
      .innerJoin(user, eq(user.id, collectionItem.userId))
      .groupBy(game.id)
      .orderBy(game.name),
    getMyOpinions(userId),
  ]);
  const playedIds = new Set(played.map((g) => g.id));
  const withOpinion = <T extends { id: number }>(g: T) => {
    const o = mine.get(g.id);
    return { ...g, sentiment: o?.sentiment ?? null, wantToPlay: o?.wantToPlay ?? false, mustPlay: o?.mustPlay ?? false };
  };
  return {
    played: played.map(withOpinion),
    unplayed: shelf.filter((g) => !playedIds.has(g.id)).map(withOpinion),
  };
}

export type SetupStatus = Awaited<ReturnType<typeof getSetupStatus>>;

/** What a member still has to do before their opinions count. */
export async function getSetupStatus(me: { id: string; bggUsername: string | null; playerId: number | null }) {
  const [[shelf], [seats], [unclaimed], [rated], rankedRows, { played }, [profile]] = await Promise.all([
    db.select({ n: count() }).from(collectionItem).where(eq(collectionItem.userId, me.id)),
    db.select({ n: count() }).from(playPlayer).where(eq(playPlayer.playerId, me.playerId ?? -1)),
    db
      .select({ n: countDistinct(player.id) })
      .from(player)
      .innerJoin(playPlayer, eq(playPlayer.playerId, player.id))
      .where(sql`${player.userId} is null`),
    db.select({ n: count() }).from(opinion).where(and(eq(opinion.userId, me.id), isNotNull(opinion.sentiment))),
    db.select({ gameId: ranking.gameId }).from(ranking).where(eq(ranking.userId, me.id)),
    getRateableGames(me.id, me.playerId),
    db.select({ bga: user.bgaUsername, nameChosenAt: user.nameChosenAt }).from(user).where(eq(user.id, me.id)),
  ]);
  const unratedPlayed = played.filter((g) => !g.sentiment).length;
  const rankedIds = new Set(rankedRows.map((r) => r.gameId));
  const unrankedPlayed = played.filter((g) => !rankedIds.has(g.id)).length;
  const tiers = await getGameTiers(played.map((g) => g.id));
  const lists = rankLists(played.map((g) => ({ id: g.id, tier: tiers.get(g.id) ?? "light" })), rankedIds);
  return {
    nameDone: Boolean(profile?.nameChosenAt),
    collection: Boolean(me.bggUsername) || shelf.n > 0,
    bga: Boolean(profile?.bga),
    played: played.length,
    ranked: played.length - unrankedPlayed,
    // Only worth asking when nothing is tied to them yet and there are names to choose from
    needsClaim: seats.n === 0 && unclaimed.n > 0,
    rated: rated.n,
    unratedPlayed,
    // Nothing played yet means nothing to rate
    rateDone: rated.n >= 10 || unratedPlayed === 0,
    unrankedPlayed,
    /** Each ranking list they've played games for, and how far into it they are */
    lists,
    rankDone: lists.every((l) => l.done),
  };
}

/**
 * Games someone has played with the group that aren't in their ranking yet, most recently
 * played first: what's new for them to rank, and whether they've rated it.
 */
export async function getNewToRank(userId: string, playerId: number | null) {
  const rows = await db
    .select({
      id: game.id,
      name: game.name,
      thumbnail: game.thumbnail,
      weight: game.weight,
      tier: game.tier,
      lastPlayed: max(play.playedOn),
      sentiment: opinion.sentiment,
    })
    .from(playPlayer)
    .innerJoin(play, eq(play.id, playPlayer.playId))
    .innerJoin(game, eq(game.id, play.gameId))
    .leftJoin(ranking, and(eq(ranking.gameId, game.id), eq(ranking.userId, userId)))
    .leftJoin(opinion, and(eq(opinion.gameId, game.id), eq(opinion.userId, userId)))
    .where(and(eq(playPlayer.playerId, playerId ?? -1), isNull(ranking.gameId)))
    .groupBy(game.id)
    .orderBy(desc(max(play.playedOn)), game.name);
  return rows.map((r) => ({ ...r, tier: gameTier(r), lastPlayed: r.lastPlayed! }));
}

/** Logged game names that didn't match a BGG game, grouped. */
export async function getReviewQueue() {
  return db
    .select({ gameName: play.gameName, count: count(), ids: sql<string>`group_concat(${play.id})` })
    .from(play)
    .where(eq(play.needsReview, true))
    .groupBy(play.gameName)
    .orderBy(desc(count()));
}

/** A night someone was at, as the plays have it: to tell which were someone else with their name */
export type SeatNight = { key: string; night: Night; playedOn: string; location: string | null; games: string[]; with: string[] };

/** The nights a player is in the plays for, newest first, with the games and who else was there */
export async function getPlayerNights(playerId: number): Promise<SeatNight[]> {
  const rows = await db
    .select({ id: play.id, night: play.night, playedOn: play.playedOn, location: play.location, name: sql<string>`coalesce(${game.name}, ${play.gameName})` })
    .from(playPlayer)
    .innerJoin(play, eq(play.id, playPlayer.playId))
    .leftJoin(game, eq(game.id, play.gameId))
    .where(eq(playPlayer.playerId, playerId))
    .orderBy(desc(play.playedOn), play.id);
  if (rows.length === 0) return [];
  const others = await db
    .select({ playId: playPlayer.playId, name: player.name })
    .from(playPlayer)
    .innerJoin(player, eq(player.id, playPlayer.playerId))
    .where(and(inArray(playPlayer.playId, rows.map((r) => r.id)), sql`${playPlayer.playerId} != ${playerId}`));
  const nights = new Map<string, SeatNight>();
  for (const r of rows) {
    const key = `${r.night}:${r.playedOn}`;
    const n = nights.get(key) ?? { key, night: r.night, playedOn: r.playedOn, location: r.location, games: [], with: [] };
    n.games.push(r.name);
    for (const o of others) if (o.playId === r.id && !n.with.includes(o.name)) n.with.push(o.name);
    nights.set(key, n);
  }
  return [...nights.values()];
}

/**
 * Names in play logs that more than one player has ("Which Lee?"), a night at a time, with
 * who they could be and who's seated for now.
 */
export async function getWhichQueue() {
  const seats = await db
    .select({ night: play.night, playedOn: play.playedOn, location: play.location, name: playPlayer.ambiguousName, seatedId: playPlayer.playerId })
    .from(playPlayer)
    .innerJoin(play, eq(play.id, playPlayer.playId))
    .where(isNotNull(playPlayer.ambiguousName))
    .orderBy(desc(play.playedOn));
  if (seats.length === 0) return [];
  const [known, people] = await Promise.all([
    db.select({ id: player.id, name: player.name, aliases: player.aliases, userId: player.userId, memberName: user.name }).from(player).leftJoin(user, eq(user.id, player.userId)),
    getPlayers(),
  ]);
  const label = new Map(people.map((p) => [p.id, p.label]));
  const asks = new Map<string, { key: string; night: Night; playedOn: string; location: string | null; name: string; seatedId: number; choices: { id: number; label: string }[] }>();
  for (const s of seats) {
    const key = `${s.night}:${s.playedOn}:${s.name!.toLowerCase()}`;
    if (asks.has(key)) continue;
    const match = matchByName(known, s.name!);
    const choices = (match && "ambiguous" in match ? match.ambiguous : match ? [match.player] : []).map((p) => ({ id: p.id, label: label.get(p.id) ?? p.name }));
    asks.set(key, { key, night: s.night, playedOn: s.playedOn, location: s.location, name: s.name!, seatedId: s.seatedId, choices });
  }
  return [...asks.values()];
}

export async function getAllGamesForPicker() {
  return db.select({ id: game.id, name: game.name, year: game.year }).from(game).orderBy(game.name);
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

export async function getSuggestions(userId: string) {
  const [rows, ownedRows] = await Promise.all([
    db
      .select({
        id: schema.suggestion.id,
        bggId: schema.suggestion.bggId,
        name: schema.suggestion.name,
        year: schema.suggestion.year,
        thumbnail: schema.suggestion.thumbnail,
        reason: schema.suggestion.reason,
        source: schema.suggestion.source,
        forUserId: schema.suggestion.forUserId,
        night: schema.suggestion.night,
        addedBy: user.name,
        createdAt: schema.suggestion.createdAt,
        score: sql<number>`coalesce(sum(${schema.suggestionVote.value}), 0)`,
        myVote: sql<number>`coalesce(max(case when ${schema.suggestionVote.userId} = ${userId} then ${schema.suggestionVote.value} end), 0)`,
      })
      .from(schema.suggestion)
      .leftJoin(schema.suggestionVote, eq(schema.suggestionVote.suggestionId, schema.suggestion.id))
      .leftJoin(user, eq(user.id, schema.suggestion.addedBy))
      .where(eq(schema.suggestion.dismissed, false))
      .groupBy(schema.suggestion.id)
      .orderBy(desc(sql`coalesce(sum(${schema.suggestionVote.value}), 0)`), desc(schema.suggestion.createdAt)),
    db.select({ id: collectionItem.gameId }).from(collectionItem).where(eq(collectionItem.own, true)),
  ]);
  // Hide anything someone has since bought
  const owned = new Set(ownedRows.map((r) => r.id));
  return rows.filter((r) => !r.bggId || !owned.has(r.bggId)).map((r) => ({ ...r, score: Number(r.score), myVote: Number(r.myVote) }));
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Members count as new for this long after signing up. */
const NEW_MEMBER_DAYS = 14;

export const isNewMember = (joinedAt: Date) => Date.now() - joinedAt.getTime() < NEW_MEMBER_DAYS * 86_400_000;

export type PersonCard = Awaited<ReturnType<typeof getPeople>>["members"][number];

/**
 * Everyone with an account, newest first, with how much of their history and
 * shelf is in, and the game at the top of each of their rankings. Regulars from
 * the play logs who haven't signed up come separately.
 */
export async function getPeople() {
  const [members, owned, rated, attendance, welcomed, lists] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        joinedAt: user.createdAt,
        bggUsername: user.bggUsername,
        discordId: user.discordId,
        color: player.color,
        playerId: player.id,
      })
      .from(user)
      .leftJoin(player, eq(player.userId, user.id))
      .orderBy(desc(user.createdAt)),
    db
      .select({ userId: collectionItem.userId, n: count() })
      .from(collectionItem)
      .where(eq(collectionItem.own, true))
      .groupBy(collectionItem.userId),
    db
      .select({ userId: opinion.userId, n: count() })
      .from(opinion)
      .where(isNotNull(opinion.sentiment))
      .groupBy(opinion.userId),
    getAttendance(),
    // Invited to the core group's nights, not signed in yet
    db
      .select({ id: player.id, name: player.name, color: player.color, discordId: player.discordId, welcomedAt: player.welcomedAt, by: user.name })
      .from(player)
      .leftJoin(user, eq(user.id, player.welcomedBy))
      .where(and(isNotNull(player.welcomedAt), isNull(player.userId)))
      .orderBy(desc(player.welcomedAt)),
    getTieredRankingLists(),
  ]);
  const topIds = TIERS.flatMap((t) => Object.values(lists[t]).map((list) => list[0]));
  const topGames = topIds.length
    ? await db.select({ id: game.id, name: game.name, thumbnail: game.thumbnail }).from(game).where(inArray(game.id, topIds))
    : [];
  const gameById = new Map(topGames.map((g) => [g.id, g]));
  const topOf = (userId: string) =>
    Object.fromEntries(TIERS.map((t) => [t, gameById.get(lists[t][userId]?.[0] ?? -1) ?? null])) as Record<Tier, (typeof topGames)[number] | null>;
  const ownedBy = new Map(owned.map((o) => [o.userId, o.n]));
  const ratedBy = new Map(rated.map((r) => [r.userId, r.n]));
  const seatsOf = new Map(attendance.map((a) => [a.id, a]));
  return {
    members: members.map((m) => ({
      ...m,
      owned: ownedBy.get(m.id) ?? 0,
      rated: ratedBy.get(m.id) ?? 0,
      nights: (m.playerId && seatsOf.get(m.playerId)?.nights) || 0,
      plays: (m.playerId && seatsOf.get(m.playerId)?.plays) || 0,
      top: topOf(m.id),
    })),
    welcomed: welcomed.map((w) => ({ ...w, welcomedAt: w.welcomedAt!, nights: seatsOf.get(w.id)?.nights ?? 0 })),
    // One-off guests aren't worth listing, and anyone welcomed is listed with them
    notSignedUp: attendance.filter((a) => !a.userId && a.nights > 1 && !welcomed.some((w) => w.id === a.id)),
  };
}

/** Members who signed up recently, newest first. */
export async function getNewMembers() {
  const since = new Date(Date.now() - NEW_MEMBER_DAYS * 86_400_000);
  return db
    .select({ id: user.id, name: user.name, image: user.image, joinedAt: user.createdAt, color: player.color })
    .from(user)
    .leftJoin(player, eq(player.userId, user.id))
    .where(sql`${user.createdAt} >= ${since.getTime()}`)
    .orderBy(desc(user.createdAt));
}

/** One member's page: their shelf, wishlist, rankings and what they've played with the group. */
export async function getPerson(userId: string) {
  const [member] = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      joinedAt: user.createdAt,
      bggUsername: user.bggUsername,
      color: player.color,
      playerId: player.id,
    })
    .from(user)
    .leftJoin(player, eq(player.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  if (!member) return null;

  const gameCols = { id: game.id, name: game.name, thumbnail: game.thumbnail, image: game.image };
  const [shelf, wishlist, top, keen, played] = await Promise.all([
    getShelf(),
    db
      .select(gameCols)
      .from(collectionItem)
      .innerJoin(game, eq(game.id, collectionItem.gameId))
      .where(and(eq(collectionItem.userId, userId), eq(collectionItem.wishlist, true)))
      .orderBy(game.name),
    db
      .select({ ...gameCols, weight: game.weight, tier: game.tier })
      .from(ranking)
      .innerJoin(game, eq(game.id, ranking.gameId))
      .where(eq(ranking.userId, userId))
      .orderBy(ranking.position),
    db
      .select({ ...gameCols, mustPlay: opinion.mustPlay })
      .from(opinion)
      .innerJoin(game, eq(game.id, opinion.gameId))
      .where(and(eq(opinion.userId, userId), sql`(${opinion.mustPlay} = 1 or ${opinion.wantToPlay} = 1)`))
      .orderBy(desc(opinion.mustPlay), game.name),
    db
      .select({ ...gameCols, plays: count(play.id) })
      .from(playPlayer)
      .innerJoin(play, eq(play.id, playPlayer.playId))
      .innerJoin(game, eq(game.id, play.gameId))
      .where(eq(playPlayer.playerId, member.playerId ?? -1))
      .groupBy(game.id)
      .orderBy(desc(count(play.id)), game.name)
      .limit(8),
  ]);
  return {
    member,
    collection: shelf.filter((g) => g.ownerIds.includes(userId)),
    wishlist,
    /** Their favorites in each tier, best first */
    top: {
      heavy: top.filter((g) => gameTier(g) === "heavy").slice(0, 5),
      light: top.filter((g) => gameTier(g) === "light").slice(0, 5),
    },
    keen,
    played,
  };
}

// ---------------------------------------------------------------------------
// Online (Board Game Arena)
// ---------------------------------------------------------------------------

export type BgaListing = typeof schema.bgaGame.$inferSelect;

/**
 * BGA's game for each BGG id. Where BGA has several (a card game's rule variants),
 * the most played one is the one to link to.
 */
export async function getBgaByBggId() {
  const rows = await db.select().from(schema.bgaGame).where(isNotNull(schema.bgaGame.bggId)).orderBy(desc(schema.bgaGame.gamesPlayed));
  const byBgg = new Map<number, BgaListing>();
  for (const r of rows) if (!byBgg.has(r.bggId!)) byBgg.set(r.bggId!, r);
  return byBgg;
}

export async function getBgaGame(bggId: number) {
  const [row] = await db.select().from(schema.bgaGame).where(eq(schema.bgaGame.bggId, bggId)).orderBy(desc(schema.bgaGame.gamesPlayed)).limit(1);
  return row ?? null;
}

/** Members and their BGA names, so they can find each other there. */
export async function getBgaMembers() {
  return db
    .select({ id: user.id, name: user.name, image: user.image, color: player.color, bgaUsername: user.bgaUsername, bgaPremium: user.bgaPremium })
    .from(user)
    .leftJoin(player, eq(player.userId, user.id))
    .orderBy(user.name);
}

export type OnlineGame = Awaited<ReturnType<typeof getOnlineGames>>[number];

/**
 * Games on BGA that the group has some tie to: on the shelf, played together, on a
 * wishlist or the buy list, or someone's up for playing it there.
 */
export async function getOnlineGames() {
  const bga = await getBgaByBggId();
  if (bga.size === 0) return [];
  const [owners, plays, opinions, wishes, buyList] = await Promise.all([
    db.select({ gameId: collectionItem.gameId, userId: collectionItem.userId }).from(collectionItem).where(eq(collectionItem.own, true)),
    db
      .select({ gameId: play.gameId, plays: count(), lastPlayed: max(play.playedOn) })
      .from(play)
      .where(isNotNull(play.gameId))
      .groupBy(play.gameId),
    db.select({ gameId: opinion.gameId, userId: opinion.userId, sentiment: opinion.sentiment, playOnline: opinion.playOnline }).from(opinion),
    db.select({ gameId: collectionItem.gameId, userId: collectionItem.userId }).from(collectionItem).where(eq(collectionItem.wishlist, true)),
    // "Want it" votes put a game on the buy list; Claude's ideas nobody has voted for don't count
    db
      .select({ gameId: schema.suggestion.bggId })
      .from(schema.suggestion)
      .innerJoin(schema.suggestionVote, eq(schema.suggestionVote.suggestionId, schema.suggestion.id))
      .where(and(eq(schema.suggestion.dismissed, false), isNotNull(schema.suggestion.bggId)))
      .groupBy(schema.suggestion.id)
      .having(sql`sum(${schema.suggestionVote.value}) > 0`),
  ]);

  const ids = new Set(
    [
      ...owners.map((o) => o.gameId),
      ...plays.map((p) => p.gameId!),
      ...opinions.filter((o) => o.playOnline).map((o) => o.gameId),
      ...wishes.map((w) => w.gameId),
      ...buyList.map((b) => b.gameId!),
    ].filter((id) => bga.has(id)),
  );
  if (ids.size === 0) return [];

  const games = await db
    .select({ id: game.id, name: game.name, thumbnail: game.thumbnail, image: game.image, weight: game.weight })
    .from(game)
    .where(inArray(game.id, [...ids]))
    .orderBy(game.name);
  const playMap = new Map(plays.map((p) => [p.gameId, p]));
  const onBuyList = new Set(buyList.map((b) => b.gameId));
  return games.map((g) => ({
    ...g,
    bga: bga.get(g.id)!,
    ownerIds: owners.filter((o) => o.gameId === g.id).map((o) => o.userId),
    plays: playMap.get(g.id)?.plays ?? 0,
    lastPlayed: playMap.get(g.id)?.lastPlayed ?? null,
    sentiments: opinions
      .filter((o) => o.gameId === g.id && o.sentiment)
      .map((o) => ({ userId: o.userId, sentiment: o.sentiment as Sentiment })),
    playOnline: opinions.filter((o) => o.gameId === g.id && o.playOnline).map((o) => o.userId),
    wishlistedBy: wishes.filter((w) => w.gameId === g.id).map((w) => w.userId),
    onBuyList: onBuyList.has(g.id),
  }));
}
