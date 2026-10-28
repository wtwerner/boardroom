/**
 * Moves coming nights whose post is in a channel that's no longer their kind's events channel
 * (the group moved its events, to a forum say) to the one it is now. Boardroom leaves them where
 * they are on its own, so a thread's talk isn't lost. Here each is posted in the new channel
 * without a ping (and announced, when the group announces nights), with everyone going or a
 * maybe added to it. The old post becomes a note linking to the new one, its thread stays with
 * a note too, and the copy of the buttons in it goes. Polls aren't moved.
 *
 *   pnpm move:posts                                                    # lists what would move
 *   pnpm move:posts --move                                             # moves them
 *   op run --env-file=.env.production.op -- pnpm move:posts --move     # production
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";

async function main() {
  // Variables already set (production's, from op run) win over the file
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  // The channels, names and time zone are on Group settings
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  const move = process.argv.includes("--move");
  // Imported after the env file is loaded — the db client reads it on import
  const { db, schema } = await import("@/db");
  const { deleteMessage, editMessage, eventsChannel, postMessage, postsNights } = await import("@/lib/discord");
  const { isClaim, joinThread, postChannel, syncNightPost } = await import("@/lib/night-post");
  const { movedMessage } = await import("@/lib/night-message");

  const n = schema.gameNight;
  const rows = await db
    .select()
    .from(n)
    .where(and(isNotNull(n.messageId), isNotNull(n.channelId), eq(n.cancelled, false), gte(n.startsAt, new Date(Date.now() - 12 * 3_600_000))));
  const stranded = rows.filter((r) => postsNights(r.night) && !isClaim(r.messageId) && r.channelId !== eventsChannel(r.night));
  if (!stranded.length) console.log("Every coming night's post is in its events channel.");

  for (const row of stranded) {
    if (!move) {
      console.log(`Night ${row.id} (${row.title}) would move from channel ${row.channelId} to ${eventsChannel(row.night)}`);
      continue;
    }
    const old = { channelId: row.channelId, messageId: row.messageId!, threadId: row.threadId, threadCardId: row.threadCardId };
    // Taken off the night first, so syncing it posts it fresh in its events channel
    await db.update(n).set({ channelId: null, messageId: null, threadId: null, threadCardId: null, url: null }).where(eq(n.id, row.id));
    const result = await syncNightPost(row.id, { quiet: true });
    if (result !== "posted") {
      // Put back as it was, so the night keeps a post
      await db.update(n).set({ ...old, url: row.url }).where(eq(n.id, row.id));
      console.log(`Night ${row.id} (${row.title}): didn't post in the new channel, left where it was`);
      continue;
    }
    await joinThread(row.id);
    const url = (await db.query.gameNight.findFirst({ where: eq(n.id, row.id), columns: { url: true } }))?.url ?? null;
    const notes: string[] = [];
    const note = (what: string, done: Promise<unknown>) => done.then(() => notes.push(what), (err) => console.error(`Night ${row.id}: couldn't ${what}`, err));
    await note("turn the old post into a note", editMessage(await postChannel(old), old.messageId, movedMessage(url)));
    if (old.threadId && old.threadCardId) await note("delete the old thread's copy of the buttons", deleteMessage(old.threadId, old.threadCardId));
    if (old.threadId && url) await note("say where it went in the old thread", postMessage(old.threadId, { content: `This event moved to its own post: ${url}` }));
    console.log(`Night ${row.id} (${row.title}): moved to ${url ?? "its new channel"} (${notes.join(", ") || "old post left as it was"})`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
