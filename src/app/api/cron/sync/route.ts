import { hasBggToken } from "@/lib/bgg";
import { refreshBgaDetails, refreshCatalog } from "@/lib/catalog";
import { syncBgaGames, syncBggCollections, syncDiscordPlays } from "@/lib/sync";

export const maxDuration = 300;

/** Nightly: pull new plays from Discord, refresh everyone's BGG collection, then the BGA game list. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, unknown> = {};
  try {
    results.discord = await syncDiscordPlays();
  } catch (err) {
    results.discord = { error: String(err) };
  }
  if (hasBggToken()) {
    try {
      results.bgg = await syncBggCollections();
    } catch (err) {
      results.bgg = { error: String(err) };
    }
    try {
      results.catalog = await refreshCatalog();
    } catch (err) {
      results.catalog = { error: String(err) };
    }
  }
  try {
    results.bga = await syncBgaGames();
    // A batch of BGA's popular games gets BGG details each night, so Online can score them
    if (hasBggToken()) results.bgaDetails = await refreshBgaDetails();
  } catch (err) {
    results.bga = { error: String(err) };
  }
  return Response.json(results);
}
