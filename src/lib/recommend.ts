import "server-only";
import { and, count, desc, eq, isNotNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Night, Tier } from "@/db/enums";
import { type ChanceModel, type GroupChance, chanceOf, groupChance, saidChance, trainChances } from "./chance";
import { isLegacy } from "./night";
import { type RankingLists, type ShelfGame, getMembers, getShelf, getSuggestions, getTieredRankingLists } from "./queries";
import { isFromLatestAsk } from "./picks";
import { rankShare } from "./ranking";
import { HEAVY_WEIGHT, NIGHT_TIER, gameTier } from "./tier";
import {
  type FitReason,
  type GameFeatures,
  type Profile,
  type Signal,
  buildProfile,
  featureConsensus,
  featureLabel,
  fit,
  similarity,
} from "./taste";

/**
 * Members need this many games with an opinion before their chances are shown or
 * count toward the group's. Below it the chance model does little better than a
 * coin flip (see chance.test.ts), so it would only be dressing up a guess.
 */
export const MIN_EVIDENCE = 6;

/** Why a game is in the running */
export type Source =
  | { kind: "claude"; forUserId: string | null; night: Night | null }
  | { kind: "member"; userId: string | null; name: string | null }
  | { kind: "wishlist"; userIds: string[] }
  | { kind: "hot" | "top" };

export type Candidate = {
  game: {
    id: number;
    name: string;
    year: number | null;
    thumbnail: string | null;
    image: string | null;
    minPlayers: number | null;
    maxPlayers: number | null;
    minPlaytime: number | null;
    maxPlaytime: number | null;
    weight: number | null;
    /** Set by hand when a game's weight puts it in the wrong list */
    tier: Tier | null;
    bggRating: number | null;
    bggRank: number | null;
  };
  fits: Record<string, MemberFit>;
  /** What group lists are sorted by */
  group: GroupChance;
  sources: Source[];
  ownerIds: string[];
  suggestion: { id: number; reason: string | null; source: "ai" | "member"; forUserId: string | null; score: number; myVote: number; createdAt: Date } | null;
  /** Members who marked it "not for me" */
  vetoedBy: string[];
  unplayed: boolean;
};

/** One member and one game: the chance they'd put it above their own average (chance.ts), or what they've already said. */
export type MemberFit = {
  /** 0–1. For a game they've rated or ranked, graded by how far it sits from their average (saidChance) */
  chance: number;
  known: boolean;
  /** Why the taste profile leans the way it does (only for games they haven't rated) */
  reasons: FitReason[];
};

/** Without enough casual night plays to learn from, it's taken to play games up to this weight */
const CASUAL_MAX_WEIGHT = 2.5;
/** Casual night plays it takes before its own games set the weight ceiling */
const CASUAL_WEIGHT_PLAYS = 8;

/** How many played at each of a night's last 30 plays */
const recentTableSizes = (night: Night) =>
  db
    .select({ n: db.$count(schema.playPlayer, eq(schema.playPlayer.playId, schema.play.id)) })
    .from(schema.play)
    .where(eq(schema.play.night, night))
    .orderBy(desc(schema.play.playedOn))
    .limit(30);

type NightGame = { minPlayers: number | null; maxPlayers: number | null; weight: number | null; tier?: Tier | null };

/**
 * Everything Discover shows: each member's taste profile, every candidate scored
 * for each member and the group, and the statistics behind it. Games for 2 players
 * at most are left out unless `twoPlayer` is set. Board Game Arena's games are only
 * scored when `online` is set: that's hundreds of games only the Online page shows. The group's lists come once per night,
 * from the same scores, each fitting that night: its usual table size and its kind of
 * game (heavy games for the core group, lighter ones, no heavier than it usually
 * plays, for the casual night).
 */
export async function getRecommendations(meId: string, myPlayerId: number | null, opts: { twoPlayer?: boolean; online?: boolean } = {}) {
  const [members, lists, opinions, collection, allGames, shelf, suggestions, catalog, groupPlays, myPlayed, coreTables, casualTables, onBga, casualWeights] = await Promise.all([
    getMembers(),
    getTieredRankingLists(),
    db.select().from(schema.opinion),
    db.select().from(schema.collectionItem),
    db
      .select({
        id: schema.game.id,
        name: schema.game.name,
        year: schema.game.year,
        thumbnail: schema.game.thumbnail,
        image: schema.game.image,
        minPlayers: schema.game.minPlayers,
        maxPlayers: schema.game.maxPlayers,
        minPlaytime: schema.game.minPlaytime,
        maxPlaytime: schema.game.maxPlaytime,
        weight: schema.game.weight,
        tier: schema.game.tier,
        bggRating: schema.game.bggRating,
        bggRank: schema.game.bggRank,
        mechanics: schema.game.mechanics,
        categories: schema.game.categories,
      })
      .from(schema.game),
    getShelf(),
    getSuggestions(meId),
    db.select().from(schema.catalogGame),
    db
      .select({ id: schema.play.gameId, times: count() })
      .from(schema.play)
      .where(isNotNull(schema.play.gameId))
      .groupBy(schema.play.gameId),
    myPlayerId
      ? db
          .selectDistinct({ id: schema.play.gameId })
          .from(schema.playPlayer)
          .innerJoin(schema.play, eq(schema.play.id, schema.playPlayer.playId))
          .where(and(eq(schema.playPlayer.playerId, myPlayerId), isNotNull(schema.play.gameId)))
      : [],
    recentTableSizes("core"),
    recentTableSizes("casual"),
    opts.online ? db.selectDistinct({ id: schema.bgaGame.bggId }).from(schema.bgaGame).where(isNotNull(schema.bgaGame.bggId)) : [],
    db
      .select({ weight: schema.game.weight })
      .from(schema.play)
      .innerJoin(schema.game, eq(schema.game.id, schema.play.gameId))
      .where(and(eq(schema.play.night, "casual"), isNotNull(schema.game.weight))),
  ]);

  const games = new Map(allGames.map((g) => [g.id, g]));

  const all = collectSignals(lists, opinions, collection);
  const profiles = members.map((m) => buildProfile(m.id, all, games as Map<number, GameFeatures>));
  const profileById = new Map(profiles.map((p) => [p.userId, p]));
  const scored = profiles.filter((p) => p.evidence >= MIN_EVIDENCE);
  const models: Map<string, ChanceModel> = trainChances(
    scored.map((p) => p.userId),
    all,
    games,
  );
  const vetoes = new Map<number, string[]>();
  for (const o of opinions) if (o.sentiment === "nope") vetoes.set(o.gameId, [...(vetoes.get(o.gameId) ?? []), o.userId]);

  const playedTimes = new Map(groupPlays.map((r) => [r.id!, r.times]));
  const playedByMe = new Set(myPlayed.map((r) => r.id!));
  const owners = new Map(shelf.map((g) => [g.id, g.ownerIds]));

  /** What a member has actually said about the game if anything, else the model's chance. */
  const fitFor = (p: Profile, g: GameFeatures): MemberFit => {
    const actual = p.prefs.get(g.id);
    if (actual !== undefined) return { chance: saidChance(actual), known: true, reasons: [] };
    const model = models.get(p.userId);
    return { chance: model ? chanceOf(model, g) : 0.5, known: false, reasons: fit(p, g).reasons };
  };

  const candidate = (gameId: number): Candidate | null => {
    const g = games.get(gameId);
    if (!g) return null;
    const fits = Object.fromEntries(profiles.map((p) => [p.userId, fitFor(p, g)]));
    return {
      game: g,
      fits,
      group: groupChance(scored.map((p) => fits[p.userId].chance)),
      sources: [],
      ownerIds: owners.get(gameId) ?? [],
      suggestion: null,
      vetoedBy: vetoes.get(gameId) ?? [],
      unplayed: !playedTimes.has(gameId),
    };
  };

  // Everything nobody owns, with where each idea came from
  const pool = new Map<number, Candidate>();
  const add = (gameId: number, source: Source) => {
    if (owners.has(gameId)) return;
    const c = pool.get(gameId) ?? candidate(gameId);
    if (!c) return;
    c.sources.push(source);
    pool.set(gameId, c);
  };
  for (const s of suggestions) {
    if (!s.bggId) continue;
    add(s.bggId, s.source === "ai" ? { kind: "claude", forUserId: s.forUserId, night: s.night } : { kind: "member", userId: null, name: s.addedBy });
    const c = pool.get(s.bggId);
    if (c) c.suggestion = { id: s.id, reason: s.reason, source: s.source, forUserId: s.forUserId, score: s.score, myVote: s.myVote, createdAt: s.createdAt };
  }
  const byStatus = (pick: (c: (typeof collection)[number]) => boolean) => {
    const out = new Map<number, string[]>();
    for (const c of collection) if (pick(c)) out.set(c.gameId, [...(out.get(c.gameId) ?? []), c.userId]);
    return out;
  };
  // Buying ideas come from wishlists and BGG's lists, besides Claude and members. Games people
  // used to own, rated on BGG or played elsewhere aren't ideas in themselves: nobody can bring them.
  for (const [id, userIds] of byStatus((c) => c.wishlist)) add(id, { kind: "wishlist", userIds });
  for (const c of catalog) add(c.gameId, { kind: c.source });

  // The usual table: median players across recent plays. Before any, everyone, plus two guests
  // on the casual night (as the planner starts it)
  const usualTable = (rows: { n: number }[], night: Night) => {
    const sizes = rows.map((t) => t.n).filter(Boolean).sort((a, b) => a - b);
    return sizes.length ? sizes[Math.floor(sizes.length / 2)] : night === "casual" ? members.length + 2 : Math.max(2, members.length);
  };
  // The casual night's ceiling: heavier than 4 in 5 of the games it has played is out
  const weights = casualWeights.map((w) => w.weight!).sort((a, b) => a - b);
  const casualCeiling = weights.length >= CASUAL_WEIGHT_PLAYS ? Math.round(weights[Math.floor(weights.length * 0.8)] * 10) / 10 : CASUAL_MAX_WEIGHT;
  const nightFit = (night: Night, tableSize: number, maxWeight: number | null) => ({
    tableSize,
    maxWeight,
    /** Seats the night's usual table and is its kind of game */
    fits: (g: NightGame) =>
      (g.minPlayers ?? 1) <= tableSize &&
      (g.maxPlayers ?? 99) >= tableSize &&
      gameTier({ weight: g.weight, tier: g.tier ?? null }) === NIGHT_TIER[night] &&
      (maxWeight === null || (g.weight ?? 0) <= maxWeight),
  });
  const byNight = { core: nightFit("core", usualTable(coreTables, "core"), null), casual: nightFit("casual", usualTable(casualTables, "casual"), casualCeiling) };

  // The group has a list for each night; one member's list is the same whichever night is showing
  const ofList = (s: { forUserId: string | null; night: Night | null }, forUserId: string | null, night: Night) =>
    s.forUserId === forUserId && (forUserId !== null || s.night === night);
  const lastRun = (forUserId: string | null, night: Night = "core") =>
    suggestions
      .filter((s) => s.source === "ai" && ofList(s, forUserId, night))
      .reduce<Date | null>((latest, s) => (!latest || s.createdAt > latest ? s.createdAt : latest), null);
  const latestAsk = { core: lastRun(null, "core"), casual: lastRun(null, "casual"), me: lastRun(meId) };
  // Each ask replaces the list; earlier picks someone wanted stay on the buy list
  const isClaude = (c: Candidate, forUserId: string | null, night: Night = "core") =>
    c.sources.some((s) => s.kind === "claude" && ofList(s, forUserId, night)) &&
    c.suggestion !== null &&
    isFromLatestAsk(c.suggestion.createdAt, forUserId === null ? latestAsk[night] : latestAsk.me);
  const byMatch = (a: Candidate, b: Candidate) => b.group.chance - a.group.chance;
  const mine = (c: Candidate) => c.fits[meId]?.chance ?? 0.5;
  const byMine = (a: Candidate, b: Candidate) => mine(b) - mine(a);
  // Games that top out at 2 players (or 1) are left out unless asked for: the group plays with more
  const forTheTable = (c: Candidate) => opts.twoPlayer || (c.game.maxPlayers ?? 99) > 2;
  const unowned = [...pool.values()].filter(forTheTable);
  const owned = shelf
    .map((g) => candidate(g.id))
    .filter((c): c is Candidate => c !== null)
    .filter(forTheTable);
  const notVetoedByMe = (c: Candidate) => !c.vetoedBy.includes(meId);
  // Turned down by enough of the group that it shouldn't be put forward
  const notWidelyVetoed = (c: Candidate) => c.vetoedBy.length < Math.max(2, scored.length / 2);

  // On BGA, nobody owns it and the group hasn't played it: worth a try online. Any player count
  // fits, since two people can play online. Only games with BGG details can be scored.
  const bgaIds = new Set(onBga.map((r) => r.id!));
  const online = [...bgaIds]
    .filter((id) => !owners.has(id) && !playedTimes.has(id) && games.get(id)?.mechanics?.length)
    .map(candidate)
    .filter((c): c is Candidate => c !== null && notWidelyVetoed(c));

  const myClaude = unowned.filter((c) => isClaude(c, meId) && notVetoedByMe(c)).sort(byMine);
  const forNight = (night: Night) => {
    const { fits, ...table } = byNight[night];
    return {
      ...table,
      fits,
      /** Claude's latest picks for this night that are still its kind of game */
      claude: unowned.filter((c) => isClaude(c, null, night) && fits(c.game)).sort(byMatch),
      claudeUpdatedAt: latestAsk[night],
      /** Everything else nobody owns that fits the night, best match first */
      more: unowned.filter((c) => !isClaude(c, null, night) && fits(c.game) && notWidelyVetoed(c)).sort(byMatch).slice(0, 18),
      /** Games someone owns now that fit the night, best match first */
      shelf: owned.filter((c) => fits(c.game) && notWidelyVetoed(c)).sort(byMatch).slice(0, 12),
    };
  };

  return {
    members,
    profiles: profileById,
    scoredMemberIds: scored.map((p) => p.userId),
    nights: { core: forNight("core"), casual: forNight("casual") },
    group: {
      /** Games someone asked for, most wanted first */
      buyList: unowned.filter((c) => c.suggestion && (c.suggestion.score > 0 || c.suggestion.source === "member")).sort((a, b) => b.suggestion!.score - a.suggestion!.score || byMatch(a, b)),
      /** Games on BGA nobody owns or has played with the group, best match first */
      online: online.sort(byMatch).slice(0, 12),
    },
    me: {
      claude: myClaude,
      claudeUpdatedAt: latestAsk.me,
      more: unowned.filter((c) => !isClaude(c, meId) && notVetoedByMe(c)).sort(byMine).slice(0, 18),
      shelf: owned.filter((c) => !playedByMe.has(c.game.id)).sort(byMine).slice(0, 12),
      enoughData: (profileById.get(meId)?.evidence ?? 0) >= MIN_EVIDENCE,
    },
    insights: buildInsights(profiles, scored, games),
  };
}

/**
 * The shelf of shame (Home's top ten, and a view on Shelf): games someone owns that the group has never played, on either night,
 * best bets first by the group's chance of liking them, as Discover scores them. Legacy games,
 * games for 2 players at most, games enough of the group turned down and anything less likely
 * than a coin flip are left out: these are the ones worth getting to the table.
 */
export async function getShelfOfShame(limit = 10, loaded?: ShelfGame[]) {
  const [shelf, members, vetoes] = await Promise.all([
    loaded ?? getShelf(),
    getMembers(),
    db.select({ gameId: schema.opinion.gameId, n: count() }).from(schema.opinion).where(eq(schema.opinion.sentiment, "nope")).groupBy(schema.opinion.gameId),
  ]);
  const turnedDown = new Set(vetoes.filter((v) => v.n >= Math.max(2, members.length / 2)).map((v) => v.gameId));
  const waiting = shelf.filter((g) => g.plays === 0 && (g.maxPlayers ?? 99) > 2 && !isLegacy(g) && !turnedDown.has(g.id));
  const chances = await getTasteChances(
    waiting.map((g) => g.id),
    { includeSaid: true },
  );
  return waiting
    .map((g) => ({ ...g, tier: gameTier(g), group: groupChance(Object.values(chances[g.id] ?? {})) }))
    .filter((g) => g.group.of === 0 || g.group.chance >= 0.5)
    .sort((a, b) => b.group.chance - a.group.chance || (b.bggRating ?? 0) - (a.bggRating ?? 0))
    .slice(0, limit);
}

/**
 * For the planner: how likely each member is to like each of `gameIds` that they haven't
 * rated or ranked in the app, as a chance (see chance.ts). Their own BGG rating answers it
 * when they have one; otherwise the chance model guesses from their taste. Members without
 * enough evidence for a model are left out, as are games they've already had their say on,
 * unless `includeSaid` is set: then what they said counts, as it does on Discover.
 */
export async function getTasteChances(gameIds: number[], { includeSaid = false } = {}): Promise<Record<number, Record<string, number>>> {
  const [members, lists, opinions, collection, allGames] = await Promise.all([
    getMembers(),
    getTieredRankingLists(),
    db.select().from(schema.opinion),
    db.select().from(schema.collectionItem),
    db
      .select({
        id: schema.game.id,
        name: schema.game.name,
        weight: schema.game.weight,
        bggRating: schema.game.bggRating,
        mechanics: schema.game.mechanics,
        categories: schema.game.categories,
      })
      .from(schema.game),
  ]);
  const games = new Map(allGames.map((g) => [g.id, g]));
  const all = collectSignals(lists, opinions, collection);
  const scored = members.map((m) => buildProfile(m.id, all, games)).filter((p) => p.evidence >= MIN_EVIDENCE);
  const models = trainChances(
    scored.map((p) => p.userId),
    all,
    games,
  );
  // Said in the app: an opinion or a place in their rankings. The planner counts those itself.
  const said = new Set(all.filter((s) => s.sentiment || s.rankPct !== undefined).map((s) => `${s.userId}:${s.gameId}`));

  const out: Record<number, Record<string, number>> = {};
  for (const id of gameIds) {
    const g = games.get(id);
    if (!g) continue;
    for (const p of scored) {
      if (!includeSaid && said.has(`${p.userId}:${id}`)) continue;
      const known = p.prefs.get(id);
      (out[id] ??= {})[p.userId] = known !== undefined ? saidChance(known) : chanceOf(models.get(p.userId)!, g);
    }
  }
  return out;
}

/**
 * Every member's signal about every game: where they rank it (among its own tier's games),
 * their rating, their own BGG rating.
 */
function collectSignals(
  lists: Record<Tier, RankingLists>,
  opinions: { userId: string; gameId: number; sentiment: Signal["sentiment"] }[],
  collection: { userId: string; gameId: number; bggUserRating: number | null }[],
): Signal[] {
  const signals = new Map<string, Signal>();
  const signal = (userId: string, gameId: number) => {
    const key = `${userId}:${gameId}`;
    if (!signals.has(key)) signals.set(key, { userId, gameId });
    return signals.get(key)!;
  };
  for (const tierLists of Object.values(lists)) {
    for (const [userId, ids] of Object.entries(tierLists)) ids.forEach((id, i) => (signal(userId, id).rankPct = rankShare(i, ids.length)));
  }
  for (const o of opinions) if (o.sentiment) signal(o.userId, o.gameId).sentiment = o.sentiment;
  for (const c of collection) if (c.bggUserRating) signal(c.userId, c.gameId).bggRating = c.bggUserRating;
  return [...signals.values()];
}

/** The group taste statistics alone, for their own page: no candidates to score or chance models to train. */
export async function getTasteInsights() {
  const [members, lists, opinions, collection, allGames] = await Promise.all([
    getMembers(),
    getTieredRankingLists(),
    db.select({ userId: schema.opinion.userId, gameId: schema.opinion.gameId, sentiment: schema.opinion.sentiment }).from(schema.opinion),
    db.select({ userId: schema.collectionItem.userId, gameId: schema.collectionItem.gameId, bggUserRating: schema.collectionItem.bggUserRating }).from(schema.collectionItem),
    db
      .select({
        id: schema.game.id,
        name: schema.game.name,
        thumbnail: schema.game.thumbnail,
        weight: schema.game.weight,
        mechanics: schema.game.mechanics,
        categories: schema.game.categories,
      })
      .from(schema.game),
  ]);
  const games = new Map(allGames.map((g) => [g.id, g]));
  const all = collectSignals(lists, opinions, collection);
  const profiles = members.map((m) => buildProfile(m.id, all, games));
  return { members, insights: buildInsights(profiles, profiles.filter((p) => p.evidence >= MIN_EVIDENCE), games) };
}

function buildInsights(profiles: Profile[], scored: Profile[], games: Map<number, { id: number; name: string; thumbnail: string | null }>) {
  const consensus = featureConsensus(scored);
  const pairs: { a: string; b: string; r: number; shared: number }[] = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const s = similarity(scored[i], scored[j]);
      if (s) pairs.push({ a: scored[i].userId, b: scored[j].userId, ...s });
    }
  }

  // Games where members' (centered) preferences are furthest apart
  const byGame = new Map<number, Record<string, number>>();
  for (const p of scored) for (const [id, pref] of p.prefs) byGame.set(id, { ...byGame.get(id), [p.userId]: pref });
  const gameSpread = [...byGame]
    .filter(([, v]) => Object.keys(v).length >= 2)
    .map(([id, v]) => {
      const vs = Object.values(v);
      return { game: games.get(id)!, prefs: v, spread: Math.max(...vs) - Math.min(...vs), mean: vs.reduce((a, b) => a + b, 0) / vs.length };
    })
    .filter((g) => g.game);

  return {
    sharedLikes: consensus.filter((f) => f.min > 0.04).sort((a, b) => b.min - a.min).slice(0, 12),
    sharedDislikes: consensus.filter((f) => f.max < -0.04).sort((a, b) => a.max - b.max).slice(0, 8),
    divisive: consensus.filter((f) => f.min < -0.04 && f.max > 0.04).sort((a, b) => b.max - b.min - (a.max - a.min)).slice(0, 8),
    weights: profiles.filter((p) => p.weight).map((p) => ({ userId: p.userId, ...p.weight! })),
    pairs: pairs.sort((x, y) => y.r - x.r),
    splitGames: gameSpread.filter((g) => g.spread > 0.9).sort((a, b) => b.spread - a.spread).slice(0, 6),
    agreedGames: gameSpread.filter((g) => Object.keys(g.prefs).length >= Math.max(2, scored.length - 1) && g.spread < 0.6).sort((a, b) => b.mean - a.mean).slice(0, 6),
    evidence: Object.fromEntries(profiles.map((p) => [p.userId, p.evidence])),
  };
}

export type Recommendations = Awaited<ReturnType<typeof getRecommendations>>;
export type TasteInsights = Recommendations["insights"];

/**
 * The statistics in words, for Claude: what each person and the group like and
 * dislike (with strengths), weights, their highest and lowest rated games, and what
 * has already been turned down.
 */
/** For Claude: the taste analysis, and for one of the group's nights, its table and weight. */
export async function describeTaste(rec: Recommendations, { forUserId, night }: { forUserId?: string; night?: Night } = {}) {
  const name = new Map(rec.members.map((m) => [m.id, m.name]));
  const gameName = new Map((await db.select({ id: schema.game.id, name: schema.game.name }).from(schema.game)).map((g) => [g.id, g.name]));
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;
  const i = rec.insights;

  const lines = [
    "## Taste analysis",
    "Computed from every ranking, rating and BGG rating. Feature strengths are centered on each person's average (+ likes, − dislikes; ±20 is strong).",
    `Usual table size: ${rec.nights[night ?? "core"].tableSize} players.`,
  ];
  if (night === "core") lines.push(`Weight for this night: BGG weight ${HEAVY_WEIGHT} and up. Nothing lighter.`);
  if (night === "casual") {
    const ceiling = rec.nights.casual.maxWeight;
    lines.push(`Weight for this night: under BGG weight ${HEAVY_WEIGHT}${ceiling !== null && ceiling < HEAVY_WEIGHT ? `, and no heavier than ${ceiling}` : ""}. Nothing heavier.`);
  }
  if (i.sharedLikes.length) lines.push(`Everyone likes: ${i.sharedLikes.map((f) => `${f.label} (min ${pct(f.min)})`).join(", ")}`);
  if (i.sharedDislikes.length) lines.push(`Nobody likes: ${i.sharedDislikes.map((f) => `${f.label} (max ${pct(f.max)})`).join(", ")}`);
  if (i.divisive.length) {
    lines.push(
      `Splits the group: ${i.divisive
        .map((f) => `${f.label} (${Object.entries(f.values).map(([id, v]) => `${name.get(id)} ${pct(v)}`).join(", ")})`)
        .join("; ")}`,
    );
  }
  if (i.pairs.length) lines.push(`Taste similarity (correlation): ${i.pairs.map((p) => `${name.get(p.a)} & ${name.get(p.b)} ${p.r.toFixed(2)}`).join(", ")}`);

  for (const p of rec.profiles.values()) {
    if (forUserId && p.userId !== forUserId) continue;
    if (p.evidence < MIN_EVIDENCE) continue;
    const features = [...p.affinity].filter(([, a]) => a.games >= 2);
    const likes = features.filter(([, a]) => a.value > 0.05).sort((a, b) => b[1].value - a[1].value).slice(0, 10);
    const dislikes = features.filter(([, a]) => a.value < -0.05).sort((a, b) => a[1].value - b[1].value).slice(0, 6);
    const ranked = [...p.rawPrefs].sort((a, b) => b[1] - a[1]);
    lines.push(
      "",
      `### ${name.get(p.userId)} (${p.evidence} games with an opinion)`,
      p.weight ? `Likes weight ${p.weight.mean.toFixed(1)} ± ${p.weight.sd.toFixed(1)}` : "",
      likes.length ? `Leans toward: ${likes.map(([k, a]) => `${featureLabel(k)} ${pct(a.value)}`).join(", ")}` : "",
      dislikes.length ? `Leans away from: ${dislikes.map(([k, a]) => `${featureLabel(k)} ${pct(a.value)}`).join(", ")}` : "",
      `Favorites: ${ranked.slice(0, 12).map(([id]) => gameName.get(id)).filter(Boolean).join(", ")}`,
      `Least favorite: ${ranked.slice(-6).reverse().map(([id]) => gameName.get(id)).filter(Boolean).join(", ")}`,
    );
  }

  const turnedDown = (await db
    .select({ name: schema.game.name, userId: schema.opinion.userId })
    .from(schema.opinion)
    .innerJoin(schema.game, eq(schema.game.id, schema.opinion.gameId))
    .where(eq(schema.opinion.sentiment, "nope")))
    .filter((r) => !forUserId || r.userId === forUserId)
    .map((r) => `${r.name} (${name.get(r.userId)})`);
  if (turnedDown.length) lines.push("", `Marked "not for me" (don't suggest these or close cousins): ${turnedDown.join(", ")}`);
  return lines.filter((l) => l !== "").join("\n");
}

/** When Claude last suggested anything, overall: used to keep cost down */
export async function lastClaudeSuggestionAt() {
  const [row] = await db.select({ at: max(schema.suggestion.createdAt) }).from(schema.suggestion).where(eq(schema.suggestion.source, "ai"));
  return row?.at ?? null;
}
