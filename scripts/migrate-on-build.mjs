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

if (skip) {
  console.log(`Migrations: skipped (${skip})`);
} else {
  const client = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("Migrations: applied");
  } catch (error) {
    console.error("Migrations: failed\n", error);
    process.exit(1);
  } finally {
    client.close();
  }
}
