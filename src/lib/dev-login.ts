import { DEMO } from "@/config";
import { isDemoMember } from "./demo";

/**
 * The "Sign in as…" shortcut exists only under `next dev` against a local
 * SQLite file. Production builds inline NODE_ENV, so this is always false there.
 */
export function isDevLoginEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    (process.env.DATABASE_URL ?? "file:local.db").startsWith("file:")
  );
}

/**
 * Who the shortcut may sign in as: anyone in local development, and on a demo (DEMO, which
 * a site with Discord set up can't turn on) only the made-up members.
 */
export function maySignInAs(userId: string) {
  return isDevLoginEnabled() || (DEMO && isDemoMember(userId));
}
