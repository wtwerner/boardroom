/**
 * Brings every post that's up in Discord in step with the current code: each coming night's
 * post and its thread's copy are edited, and its thread renamed for its title, and each open
 * poll's post and copy are edited. Run it after a change to how posts look, so the ones already
 * up don't wait for their next change. Safe to run again.
 *
 *   pnpm refresh:posts                                            # uses .env.local
 *   op run --env-file=.env.production.op -- pnpm refresh:posts    # production
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";

async function main() {
  // Variables already set (production's, from op run) win over the file
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  // Imported after the env file is loaded — the db client reads it on import
  const { db, schema } = await import("@/db");
  const { renameNightThread, syncNightPost } = await import("@/lib/night-post");
  const { syncPollPost } = await import("@/lib/poll-post");

  const n = schema.gameNight;
  const nights = await db
    .select({ id: n.id, title: n.title })
    .from(n)
    .where(and(isNotNull(n.messageId), eq(n.cancelled, false), gte(n.startsAt, new Date(Date.now() - 12 * 3_600_000))));
  for (const night of nights) {
    const result = await syncNightPost(night.id);
    if (result) await renameNightThread(night.id);
    console.log(`Night ${night.id} (${night.title}): ${result ?? "skipped"}`);
  }

  const p = schema.datePoll;
  const polls = await db.select({ id: p.id, title: p.title }).from(p).where(and(isNotNull(p.messageId), eq(p.status, "open")));
  for (const poll of polls) console.log(`Poll ${poll.id} (${poll.title || "untitled"}): ${(await syncPollPost(poll.id)) ?? "skipped"}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
