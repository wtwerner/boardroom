/**
 * Runs before `next build`: applies any new migrations, so a deploy never puts code in front of
 * a database that doesn't have its columns yet. Keep schema changes additive (see CONTRIBUTING),
 * since the old code is still serving while this runs.
 *
 * Uses drizzle-orm's migrator rather than `drizzle-kit migrate`, which exits 1 without printing why
 * a migration failed. Both record applied migrations in the same `__drizzle_migrations` table.
 *
 * Skipped with no DATABASE_URL set (a local build reads .env.local later, in Next), on Vercel
 * preview builds (a branch must never change the production database), or with SKIP_MIGRATE=1.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const skip = !process.env.DATABASE_URL
  ? "no DATABASE_URL"
  : process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? `a ${process.env.VERCEL_ENV} build`
    : process.env.SKIP_MIGRATE === "1"
      ? "SKIP_MIGRATE=1"
      : null;

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

// Turso sometimes drops a build machine's connection mid-run ("fetch failed", "other side closed").
// Retrying is safe: pending migrations are applied in one transaction, and applied ones are skipped.
// A failed SQL statement has no "fetch failed" in its causes, so it fails on the first attempt.
function isConnectionError(error) {
  for (let e = error; e; e = e.cause) {
    if (e instanceof TypeError && e.message === "fetch failed") return true;
  }
  return false;
}

async function migrateOnce() {
  const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    client.close();
  }
}

if (skip) {
  console.log(`Migrations: skipped (${skip})`);
} else {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrateOnce();
      console.log("Migrations: applied");
      break;
    } catch (error) {
      if (attempt < ATTEMPTS && isConnectionError(error)) {
        console.warn(`Migrations: lost the database connection (attempt ${attempt} of ${ATTEMPTS}), retrying\n`, error);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      console.error("Migrations: failed\n", error);
      process.exit(1);
    }
  }
}
