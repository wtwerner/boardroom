/**
 * What a group sets for itself on Group settings: what's stored for each setting, how a value
 * from the form or the database is checked, and the environment variable it was read from before
 * the site had a settings page. Pure; settings-store.ts reads and writes the table, and
 * src/config.ts turns the result into the values the rest of the site reads.
 */

import { z } from "zod";

type Env = Record<string, string | undefined>;

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** Discord ids (snowflakes) are 17 to 20 digits */
const SNOWFLAKE = /^\d{17,20}$/;

const text = (max: number, fallback: string) =>
  z.preprocess((v) => (blank(v) ? fallback : trimmed(v)), z.string().max(max, { error: `Keep it under ${max + 1} characters.` }));

/** Blank means "work it out" (a night's title from its name), so it stays null */
const optionalText = (max: number) =>
  z.preprocess((v) => (blank(v) ? null : trimmed(v)), z.string().max(max, { error: `Keep it under ${max + 1} characters.` }).nullable());

const number = (min: number, max: number, fallback: number, step: "int" | "any" = "any") =>
  z.preprocess(
    (v) => (blank(v) ? fallback : typeof v === "string" ? Number(v) : v),
    (step === "int" ? z.number().int({ error: "Use a whole number." }) : z.number({ error: "That isn't a number." }))
      .min(min, { error: `Use a number from ${min} to ${max}.` })
      .max(max, { error: `Use a number from ${min} to ${max}.` }),
  );

const flag = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const discordId = (what: string) =>
  z.preprocess((v) => (blank(v) ? null : trimmed(v)), z.string().regex(SNOWFLAKE, { error: `That isn't a Discord ${what} id.` }).nullable());

/** "here", "everyone" or a role id; an @ in front is fine */
const ping = z.preprocess(
  (v) => (blank(v) ? null : typeof v === "string" ? v.trim().replace(/^@/, "") : v),
  z
    .string()
    .refine((s) => s === "here" || s === "everyone" || SNOWFLAKE.test(s), { error: "Use here, everyone or a role." })
    .nullable(),
);

const timeZone = z.preprocess(
  (v) => (blank(v) ? "UTC" : trimmed(v)),
  z.string().refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { error: "That isn't a time zone. Try one like America/Chicago or Europe/London." },
  ),
);

/**
 * Every setting: its check, and where it came from before it was set on the site (an
 * environment variable's name, or how to work it out from several). Older sites keep reading
 * those until an admin first saves Group settings.
 */
const SETTINGS = {
  siteName: { schema: text(40, "Boardroom"), env: "SITE_NAME" },
  timeZone: { schema: timeZone, env: "APP_TIMEZONE" },
  casualNight: { schema: flag, env: (e: Env) => Boolean(e.DISCORD_CASUAL_CHANNEL_ID?.trim()) || e.CASUAL_NIGHT?.trim() === "on" },
  coreNightName: { schema: text(30, "Game night"), env: "CORE_NIGHT_NAME" },
  casualNightName: { schema: text(30, "Casual night"), env: "CASUAL_NIGHT_NAME" },
  coreNightTitle: { schema: optionalText(80), env: "CORE_NIGHT_TITLE" },
  casualNightTitle: { schema: optionalText(80), env: "CASUAL_NIGHT_TITLE" },
  heavyWeight: { schema: number(1, 5, 2.75), env: "HEAVY_GAME_WEIGHT" },
  reminderHours: { schema: number(0, 72, 3, "int"), env: "NIGHT_REMINDER_HOURS" },
  // Newer than the settings page, so there's no environment variable to fall back to
  coreMinPeople: { schema: number(1, 50, 2, "int"), env: () => null },
  casualMinPeople: { schema: number(1, 50, 3, "int"), env: () => null },
  claude: { schema: flag, env: "CLAUDE" },
  claudeIdeasPerDay: { schema: number(1, 50, 5, "int"), env: "CLAUDE_IDEAS_PER_DAY" },
  playsChannel: { schema: discordId("channel"), env: "DISCORD_PLAYS_CHANNEL_ID" },
  casualChannel: { schema: discordId("channel"), env: "DISCORD_CASUAL_CHANNEL_ID" },
  coreEventsChannel: { schema: discordId("channel"), env: "DISCORD_CORE_EVENTS_CHANNEL_ID" },
  casualEventsChannel: { schema: discordId("channel"), env: "DISCORD_CASUAL_EVENTS_CHANNEL_ID" },
  coreAnnounceChannel: { schema: discordId("channel"), env: "DISCORD_CORE_ANNOUNCE_CHANNEL_ID" },
  casualAnnounceChannel: { schema: discordId("channel"), env: "DISCORD_CASUAL_ANNOUNCE_CHANNEL_ID" },
  welcomeChannel: { schema: discordId("channel"), env: "DISCORD_WELCOME_CHANNEL_ID" },
  memberRole: { schema: discordId("role"), env: "DISCORD_MEMBER_ROLE_ID" },
  coreNightPing: { schema: ping, env: "DISCORD_CORE_NIGHT_PING" },
  casualNightPing: { schema: ping, env: "DISCORD_CASUAL_NIGHT_PING" },
} satisfies Record<string, { schema: z.ZodType; env: string | ((e: Env) => unknown) }>;

export type SettingKey = keyof typeof SETTINGS;
export type GroupSettings = { [K in SettingKey]: z.output<(typeof SETTINGS)[K]["schema"]> };
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** What the table holds: a value for each setting an admin has saved */
export type StoredSettings = Partial<Record<string, unknown>>;

/**
 * The group's settings: what's stored for each, or for one never saved, its old environment
 * variable. Anything that doesn't pass its check (a hand-edited row, a typo in an environment
 * variable) falls back to the default rather than breaking the site.
 */
export function resolveSettings(stored: StoredSettings, env: Env): GroupSettings {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const { schema, env: from } = SETTINGS[key];
    const raw = key in stored ? stored[key] : typeof from === "function" ? from(env) : env[from];
    const parsed = schema.safeParse(raw);
    out[key] = parsed.success ? parsed.data : schema.parse(null);
  }
  return out as GroupSettings;
}

/**
 * Check what an admin sent from Group settings. Settings the form left out keep their current
 * values; each problem is reported against its field.
 */
export function checkSettings(input: Partial<Record<SettingKey, unknown>>, current: GroupSettings): { ok: true; settings: GroupSettings } | { ok: false; errors: Partial<Record<SettingKey, string>> } {
  const settings = { ...current } as Record<string, unknown>;
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const key of SETTING_KEYS) {
    if (!(key in input)) continue;
    const parsed = SETTINGS[key].schema.safeParse(input[key]);
    if (parsed.success) settings[key] = parsed.data;
    else errors[key] = parsed.error.issues[0]?.message ?? "That doesn't look right.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings: settings as GroupSettings };
}

/** The settings as table rows. A cleared setting is stored too ("" for nothing), so it doesn't fall back to an old environment variable */
export function settingRows(settings: GroupSettings) {
  return SETTING_KEYS.map((key) => ({ key, value: settings[key] ?? "" }));
}
