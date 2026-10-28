import { revalidateTag } from "next/cache";
import { DEMO } from "@/config";
import { hasBggToken } from "@/lib/bgg";
import { refreshBgaDetails, refreshCatalog } from "@/lib/catalog";
import { resetDemo } from "@/lib/demo-seed";
import { SETTINGS_TAG, loadSettings } from "@/lib/settings-store";
import { syncBgaGames, syncBggCollections, syncDiscordPlays } from "@/lib/sync";

export const maxDuration = 300;

/**
 * Nightly: pull new plays from Discord, refresh everyone's BGG collection, then the BGA game list.
 * A demo has no Discord or BGG to sync, so its made-up group is put back as it was instead.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await loadSettings({ fresh: true });
  const results: Record<string, unknown> = {};
  if (DEMO) {
    try {
      results.demo = await resetDemo();
      // Group settings went back to the environment variables
      revalidateTag(SETTINGS_TAG, "max");
    } catch (err) {
      return Response.json({ demo: { error: String(err) } }, { status: 500 });
    }
  } else {
    await syncGroup(results);
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

async function syncGroup(results: Record<string, unknown>) {
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
}
