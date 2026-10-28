/**
 * Puts a demo site's made-up group back as it was: the same reset its nightly cron does, for
 * the first time or between nights. Run it with the demo's variables, CASUAL_NIGHT included:
 *
 *   DEMO=on CASUAL_NIGHT=on DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm reset:demo
 */
import { resetDemo } from "@/lib/demo-seed";

resetDemo().then((summary) => {
  console.log(summary);
  process.exit(0);
});
