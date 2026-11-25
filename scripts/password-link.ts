/**
 * Prints a link for someone to choose a new password, for when no admin can make one on People
 * and access (the only admin forgot theirs, and the site doesn't send email). Works once, for a day.
 *
 *   pnpm password:link sam@example.com                                                # .env.local
 *   node scripts/with-env.mjs .env.production pnpm password:link sam@example.com      # production
 */
import { existsSync } from "node:fs";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Give the email they sign in with: pnpm password:link sam@example.com");
  // Variables already set win, so the same script runs against production
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/db");
  const { SITE_URL } = await import("@/config");
  const { makePasswordLink } = await import("@/lib/account-store");
  const u = await db.query.user.findFirst({ where: eq(schema.user.email, email), columns: { id: true, name: true } });
  if (!u) throw new Error(`Nobody signs in with ${email}.`);
  console.log(`For ${u.name}: ${SITE_URL ?? ""}${await makePasswordLink(u.id, null)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
