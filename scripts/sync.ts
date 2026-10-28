/**
 * Runs the same sync as the nightly cron, from your machine. Handy for the
 * first import of a long Discord history (no serverless time limit).
 *
 *   pnpm sync                              # uses .env.local
 *   pnpm sync .env.production.local        # e.g. point at Turso
 */
async function main() {
  process.loadEnvFile(process.argv[2] ?? ".env.local");
  // The channels, names and time zone are on Group settings
  await (await import("@/lib/settings-store")).loadSettings({ fresh: true });
  // Imported after the env file is loaded — the db client reads it on import
  const { hasBggToken } = await import("@/lib/bgg");
  const { syncBgaGames, syncBggCollections, syncDiscordPlays } = await import("@/lib/sync");

  console.log("Discord:", await syncDiscordPlays());
  if (hasBggToken()) {
    const { refreshCatalog } = await import("@/lib/catalog");
    console.log("BGG:", await syncBggCollections());
    console.log("Catalog:", await refreshCatalog());
  }
  else console.log("BGG: skipped (no BGG_API_TOKEN)");
  console.log("BGA:", await syncBgaGames());
  if (hasBggToken()) {
    const { refreshBgaDetails } = await import("@/lib/catalog");
    console.log("BGA details:", await refreshBgaDetails());
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
