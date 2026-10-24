import "server-only";
import { and, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchGameDetails, fetchHotGames, hasBggToken } from "./bgg";
import { upsertGameDetails } from "./sync";

/**
 * Widely loved games across weights and styles, as BGG ids. They're checked against
 * BGG on every refresh, so a wrong id just drops out rather than showing a random game.
 */
const CURATED = [
  // Heavy and strategic
  224517, 342942, 233078, 316554, 397598, 167791, 115746, 187645, 162886, 193738, 341165, 220308, 169786, 12333, 182028, 124361,
  96848, 120677, 84876, 271320, 177736, 164928, 246900, 251247, 184267, 284378, 161533, 175914, 2651, 350184, 317985, 276025,
  216132, 247763, 229853, 256960, 332686, 291572, 126163, 102680, 182874, 43015, 28720, 3076, 31260, 102794, 35677, 18602,
  185343, 163068, 172386, 245638, 321608,
  // Campaigns, co-ops and adventures
  161936, 221107, 314040, 174430, 291457, 295770, 121921, 205059, 205637, 285774, 255984, 300531, 277659, 191189, 209010,
  192135, 180263, 146021, 167355,
  // Medium
  312484, 199792, 266192, 237182, 201808, 266507, 183394, 170216, 110327, 155821, 157354, 205896, 39463, 236457, 266810,
  258779, 72125, 34635, 36218, 28143,
  // Light, quick and party
  295947, 366013, 373106, 324856, 284083, 173346, 148228, 230802, 163412, 178900, 822, 9209, 13, 30549, 262543, 244521,
  199561, 263918, 217372, 155426, 181304, 225694, 254640, 98778, 244992, 129622, 92415, 131357, 157969, 39856, 245654,
  233867, 283155, 281259, 266524, 290236, 68448, 70323, 40692,
];

/** How far down BGG's overall ranking a curated game may sit and still be suggested */
const MAX_RANK = 2500;

/**
 * Refresh the discovery catalog: BGG's hot list plus the curated list, keeping base
 * games only, with details stored so every candidate can be scored.
 */
export async function refreshCatalog(): Promise<{ hot: number; top: number }> {
  if (!hasBggToken()) return { hot: 0, top: 0 };
  const hot = await fetchHotGames();
  const ids = [...new Set([...hot, ...CURATED])];

  // Details we already have and refreshed recently don't need fetching again
  const known = new Map(
    (
      await db
        .select({ id: schema.game.id, rank: schema.game.bggRank, fetched: schema.game.detailsFetchedAt })
        .from(schema.game)
        .where(inArray(schema.game.id, ids))
    ).map((g) => [g.id, g]),
  );
  const stale = ids.filter((id) => {
    const g = known.get(id);
    return !g?.fetched || g.fetched.getTime() < Date.now() - 30 * 86_400_000;
  });
  const fresh = await fetchGameDetails(stale);
  const expansions = new Set(fresh.filter((d) => d.expansion).map((d) => d.id));
  await upsertGameDetails(fresh.filter((d) => !d.expansion));
  const rank = new Map([...known].map(([id, g]) => [id, g.rank]));
  for (const d of fresh) rank.set(d.id, d.bggRank);

  const rows = [
    ...hot.filter((id) => !expansions.has(id) && rank.has(id)).map((gameId, position) => ({ gameId, source: "hot" as const, position })),
    ...CURATED.filter((id) => !hot.includes(id) && !expansions.has(id) && (rank.get(id) ?? Infinity) <= MAX_RANK).map((gameId, position) => ({
      gameId,
      source: "top" as const,
      position,
    })),
  ];
  await db.transaction(async (tx) => {
    await tx.delete(schema.catalogGame);
    if (rows.length) await tx.insert(schema.catalogGame).values(rows);
  });
  return { hot: rows.filter((r) => r.source === "hot").length, top: rows.filter((r) => r.source === "top").length };
}

/** How many of BGA's most played games are scored for Online's recommendations */
const BGA_POOL = 400;
/** BGG details fetched per run: 20 games a request, a couple of seconds apart */
const BGA_DETAILS_PER_RUN = 100;
/** BGA games BGG had no base game for (an expansion id, or a removed one), so they aren't asked about every night */
const BGA_SKIPPED_KEY = "bga:skipped_bgg_ids";

/**
 * Fetch BGG details for BGA's most played games, a batch per run, so they can be
 * scored. Once fetched they're refreshed with every other game's details.
 */
export async function refreshBgaDetails(limit = BGA_DETAILS_PER_RUN): Promise<number> {
  if (!hasBggToken()) return 0;
  const popular = await db
    .select({ bggId: schema.bgaGame.bggId })
    .from(schema.bgaGame)
    .where(isNotNull(schema.bgaGame.bggId))
    .groupBy(schema.bgaGame.bggId)
    .orderBy(desc(max(schema.bgaGame.gamesPlayed)))
    .limit(BGA_POOL);
  const ids = popular.map((r) => r.bggId!);
  const detailed = new Set(
    (
      await db
        .select({ id: schema.game.id })
        .from(schema.game)
        .where(and(inArray(schema.game.id, ids), isNotNull(schema.game.detailsFetchedAt)))
    ).map((g) => g.id),
  );
  const skippedRow = await db.query.syncState.findFirst({ where: eq(schema.syncState.key, BGA_SKIPPED_KEY) });
  const skipped = new Set<number>(skippedRow ? JSON.parse(skippedRow.value) : []);
  const missing = ids.filter((id) => !detailed.has(id) && !skipped.has(id)).slice(0, limit);
  if (missing.length === 0) return 0;

  const fresh = await fetchGameDetails(missing);
  const base = fresh.filter((d) => !d.expansion);
  await upsertGameDetails(base);
  const got = new Set(base.map((d) => d.id));
  const newlySkipped = missing.filter((id) => !got.has(id));
  if (newlySkipped.length) {
    const value = JSON.stringify([...skipped, ...newlySkipped]);
    await db.insert(schema.syncState).values({ key: BGA_SKIPPED_KEY, value }).onConflictDoUpdate({ target: schema.syncState.key, set: { value } });
  }
  return base.length;
}
