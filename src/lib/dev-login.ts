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
