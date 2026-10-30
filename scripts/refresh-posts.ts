/**
 * Brings every post that's up in Discord in step with the current code: each coming night's
 * post and its thread's copy are edited, and its thread renamed for its title (a night finding
 * its date included, whose post shows the dates on offer). Announcements are edited, or posted (without a ping) for
 * posts that have none since an announce channel was set. Run it after a change to how posts
 * look, so the ones already up don't wait for their next change. Safe to run again.
 *
 *   pnpm refresh:posts                                            # uses .env.local
 *   op run --env-file=.env.production.op -- pnpm refresh:posts    # production
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";

async function main() {
  // Variables already set (production's, from op run) win over the file
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  // The channels, names and time zone are on Group settings
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  // Imported after the env file is loaded — the db client reads it on import
  const { db, schema } = await import("@/db");
  const { renameNightThread, syncNightPost } = await import("@/lib/night-post");

  const n = schema.gameNight;
  const nights = await db
    .select({ id: n.id, title: n.title })
    .from(n)
    .where(and(isNotNull(n.messageId), eq(n.cancelled, false), gte(n.startsAt, new Date(Date.now() - 12 * 3_600_000))));
  for (const night of nights) {
    const result = await syncNightPost(night.id);
    if (result) await renameNightThread(night.id);
    console.log(`Night ${night.id} (${night.title || "no name yet"}): ${result ?? "skipped"}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
