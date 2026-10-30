/**
 * Brings the log posts already in Discord in step with the current code: each night's games in
 * the night's order, a link button for every game (five to a row), a link to the night's thread,
 * and a copy in the thread. A night the app posted in more than one message (logged in batches)
 * becomes one: its plays move to the newest, and the older ones are deleted. Only the app's own
 * posts change; hand-written ones stay as they are. Safe to run again.
 *
 *   pnpm refresh:logs [days]                                            # uses .env.local; 30 days by default
 *   op run --env-file=.env.production.op -- pnpm refresh:logs [days]    # production
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";

async function main() {
  // Variables already set (production's, from op run) win over the file
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  // Imported after the env file is loaded — the db client reads it on import
  const { db, schema } = await import("@/db");
  const { canPostToDiscord, deletePlaysMessage } = await import("@/lib/discord");
  const { playOrder, refreshLogPost } = await import("@/lib/log-post");

  const days = Number(process.argv[2]) || 30;
  const since = new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA");
  const p = schema.play;
  const plays = await db
    .select({ id: p.id, night: p.night, playedOn: p.playedOn, sourceRef: p.sourceRef })
    .from(p)
    .where(and(eq(p.source, "manual"), isNotNull(p.sourceRef), gte(p.playedOn, since)))
    .orderBy(playOrder);

  const nights = new Map<string, typeof plays>();
  for (const play of plays) nights.set(`${play.night}:${play.playedOn}`, [...(nights.get(`${play.night}:${play.playedOn}`) ?? []), play]);
  for (const [key, ps] of nights) {
    const { night } = ps[0];
    if (!canPostToDiscord(night)) {
      console.log(`${key}: skipped, posting isn't set up for it`);
      continue;
    }
    // Message ids are snowflakes: the longest, then the highest, is the newest
    const messages = [...new Set(ps.map((x) => x.sourceRef!.split(":")[0]))].sort((a, b) => b.length - a.length || b.localeCompare(a));
    const [newest, ...older] = messages;
    for (const x of ps) if (!x.sourceRef!.startsWith(`${newest}:`)) await db.update(p).set({ sourceRef: `${newest}:merge-${x.id}` }).where(eq(p.id, x.id));
    try {
      await refreshLogPost(newest, night);
      for (const m of older) await deletePlaysMessage(night, m).catch((err) => console.error(`${key}: couldn't delete ${m}`, err));
      console.log(`${key}: ${ps.length} ${ps.length === 1 ? "game" : "games"} in ${newest}${older.length ? `, merged from ${older.length + 1} posts` : ""}`);
    } catch (err) {
      console.error(`${key}: couldn't update ${newest}`, err);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
