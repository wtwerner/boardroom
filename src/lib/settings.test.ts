import { describe, expect, it } from "vitest";
import { checkSettings, resolveSettings, settingRows } from "./settings";

describe("resolveSettings", () => {
  it("uses the defaults with nothing stored or set", () => {
    const s = resolveSettings({}, {});
    expect(s).toMatchObject({ siteName: "Boardroom", timeZone: "UTC", casualNight: false, coreNightName: "Game night", heavyWeight: 2.75, reminderHours: 3, coreMinPeople: 2, casualMinPeople: 3, claude: false, claudeIdeasPerDay: 5 });
    expect(s.playsChannel).toBeNull();
    expect(s.coreNightTitle).toBeNull();
  });

  it("reads the old environment variables for settings never saved", () => {
    const s = resolveSettings(
      {},
      { SITE_NAME: "Meeple Club", APP_TIMEZONE: "America/Chicago", DISCORD_PLAYS_CHANNEL_ID: "100000000000000001", NIGHT_REMINDER_HOURS: "0", CLAUDE: "on", DISCORD_CORE_NIGHT_PING: "here" },
    );
    expect(s).toMatchObject({ siteName: "Meeple Club", timeZone: "America/Chicago", playsChannel: "100000000000000001", reminderHours: 0, claude: true, coreNightPing: "here" });
  });

  it("turns the casual night on from its channel, as the environment variables always did", () => {
    expect(resolveSettings({}, { DISCORD_CASUAL_CHANNEL_ID: "100000000000000002" }).casualNight).toBe(true);
    expect(resolveSettings({}, { CASUAL_NIGHT: "on" }).casualNight).toBe(true);
  });

  it("prefers what's stored, even when it was cleared", () => {
    const s = resolveSettings({ siteName: "Table Talk", playsChannel: "", casualNight: false }, { SITE_NAME: "Meeple Club", DISCORD_PLAYS_CHANNEL_ID: "100000000000000001", CASUAL_NIGHT: "on" });
    expect(s).toMatchObject({ siteName: "Table Talk", playsChannel: null, casualNight: false });
  });

  it("falls back to the default for anything that doesn't pass its check", () => {
    const s = resolveSettings({ heavyWeight: 9, timeZone: "Mars/Olympus" }, { DISCORD_PLAYS_CHANNEL_ID: "general" });
    expect(s).toMatchObject({ heavyWeight: 2.75, timeZone: "UTC", playsChannel: null });
  });
});

describe("checkSettings", () => {
  const current = resolveSettings({}, {});

  it("takes form values and keeps what the form left out", () => {
    const r = checkSettings({ siteName: "  Table Talk ", heavyWeight: "3", casualNight: "on", coreNightPing: "@everyone" }, current);
    expect(r).toEqual({ ok: true, settings: { ...current, siteName: "Table Talk", heavyWeight: 3, casualNight: true, coreNightPing: "everyone" } });
  });

  it("reports each problem against its field", () => {
    const r = checkSettings({ timeZone: "Chicago", reminderHours: "2.5", memberRole: "Members", coreNightPing: "the group" }, current);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["coreNightPing", "memberRole", "reminderHours", "timeZone"]);
  });

  it("turns a blank field back into its default", () => {
    const r = checkSettings({ siteName: "", coreNightTitle: "" }, { ...current, siteName: "Table Talk", coreNightTitle: "{date} {game}" });
    expect(r.ok && r.settings).toMatchObject({ siteName: "Boardroom", coreNightTitle: null });
  });
});

describe("settingRows", () => {
  it("stores every setting, cleared ones as blank", () => {
    const rows = settingRows(resolveSettings({}, {}));
    expect(rows).toContainEqual({ key: "playsChannel", value: "" });
    expect(rows).toContainEqual({ key: "heavyWeight", value: 2.75 });
    expect(resolveSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])), { SITE_NAME: "Ignored" }).siteName).toBe("Boardroom");
  });
});
