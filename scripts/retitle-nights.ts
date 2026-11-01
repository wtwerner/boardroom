/**
 * Brings coming nights' titles up to the template as it is now (the year in the date, after
 * "10/29" became "10/29/26"), then edits each night's post and renames its thread to match.
 * Titles named by hand stay as they are. Safe to run again.
 *
 *   pnpm retitle:nights --dry                                           # lists what would change
 *   op run --env-file=.env.production.op -- pnpm retitle:nights         # production
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";

async function main() {
  const dry = process.argv.includes("--dry");
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  const { db, schema } = await import("@/db");
  const { renameNightThread, syncNightPost } = await import("@/lib/night-post");
  const { titleForGame } = await import("@/lib/night-store");
  const { NIGHT_TITLES } = await import("@/config");
  const { retitle } = await import("@/lib/night-title");
  const { localDate } = await import("@/lib/nights");

  const n = schema.gameNight;
  const nights = await db
    .select({ id: n.id, title: n.title, night: n.night, startsAt: n.startsAt, findingDate: n.findingDate })
    .from(n)
    .where(and(eq(n.cancelled, false), gte(n.startsAt, new Date(Date.now() - 12 * 3_600_000))));
  for (const night of nights) {
    if (night.findingDate) continue;
    if (dry) {
      const next = retitle(night.title, NIGHT_TITLES[night.night], localDate(night.startsAt), null);
      console.log(`Night ${night.id}: "${night.title}" ${next === night.title ? "(stays)" : "(would change; the game part is kept as locked in)"}`);
      continue;
    }
    const changed = await titleForGame(night.id);
    const posted = await db.query.gameNight.findFirst({ where: and(eq(n.id, night.id), isNotNull(n.messageId)), columns: { title: true } });
    const result = changed && posted ? await syncNightPost(night.id) : null;
    if (result) await renameNightThread(night.id);
    console.log(`Night ${night.id}: ${changed ? `now "${posted?.title ?? night.title}"` : "unchanged"}${result ? `, post ${result}` : ""}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
