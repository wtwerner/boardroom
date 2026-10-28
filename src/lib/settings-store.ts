import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { applySettings } from "@/config";
import { db, schema } from "@/db";
import { type GroupSettings, type StoredSettings, resolveSettings, settingRows } from "./settings";

/** Saving Group settings expires this tag, so pages built with the old settings are built again */
export const SETTINGS_TAG = "settings";

async function readStored(): Promise<StoredSettings> {
  const rows = await db.select({ key: schema.setting.key, value: schema.setting.value }).from(schema.setting);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** For the parts of pages built ahead of time (the header, page titles): kept until the settings change */
async function cachedStored(): Promise<StoredSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  try {
    const stored = await readStored();
    cacheLife("max");
    return stored;
  } catch (err) {
    // Built without the database (a preview, a fresh clone): the environment variables will do for a minute
    console.error("Couldn't read the group's settings", err);
    cacheLife("minutes");
    return {};
  }
}

/**
 * Put the group's saved settings into src/config.ts. Every page and layout awaits it before
 * reading a setting (requireUser() does too), and so does every route and script.
 *
 * `fresh` reads the table itself rather than the cached copy: for requests that act on the
 * settings (actions, Discord, crons) and scripts, which run outside Next's cache. If the read
 * fails, the settings already in place stay.
 */
export async function loadSettings({ fresh = false } = {}) {
  try {
    const stored = fresh || !process.env.__NEXT_USE_CACHE ? await readStored() : await cachedStored();
    applySettings(resolveSettings(stored, process.env));
  } catch (err) {
    console.error("Couldn't load the group's settings", err);
  }
}

/** Save every setting, so none of them falls back to an old environment variable again */
export async function saveSettings(settings: GroupSettings) {
  const rows = settingRows(settings);
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(schema.setting)
        .values(row)
        .onConflictDoUpdate({ target: schema.setting.key, set: { value: row.value, updatedAt: new Date() } });
    }
  });
  applySettings(resolveSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])), process.env));
}
