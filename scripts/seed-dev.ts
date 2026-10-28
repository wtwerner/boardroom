/**
 * Fills a LOCAL database with a believable game group so the UI can be explored without
 * Discord/BGG credentials: the made-up group a demo site resets to (src/lib/demo-seed.ts).
 *
 *   pnpm seed:dev
 */
import { seedGroup } from "@/lib/demo-seed";

if (!(process.env.DATABASE_URL ?? "file:local.db").startsWith("file:")) {
  throw new Error("seed-dev only runs against a local file: database");
}

seedGroup().then((summary) => {
  console.log(summary);
  process.exit(0);
});
