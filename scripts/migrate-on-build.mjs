/**
 * Runs before `next build`: applies any new migrations, so a deploy never puts code in front of
 * a database that doesn't have its columns yet. Keep schema changes additive (see CONTRIBUTING),
 * since the old code is still serving while this runs.
 *
 * Skipped with no DATABASE_URL set (a local build reads .env.local later, in Next), on Vercel
 * preview builds (a branch must never change the production database), or with SKIP_MIGRATE=1.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

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
  const { status } = spawnSync(join("node_modules", ".bin", "drizzle-kit"), ["migrate"], { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}
