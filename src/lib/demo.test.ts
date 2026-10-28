import { describe, expect, it } from "vitest";
import { demoCalendar, demoRefusal, isDemoMember } from "./demo";

describe("demoRefusal", () => {
  it("is a demo with DEMO=on and no Discord", () => {
    expect(demoRefusal({ DEMO: "on" })).toBeNull();
    expect(demoRefusal({ DEMO: " on ", DISCORD_BOT_TOKEN: "", DISCORD_GUILD_ID: " " })).toBeNull();
  });

  it("isn't one without DEMO=on", () => {
    expect(demoRefusal({})).toBe("DEMO isn't on");
    expect(demoRefusal({ DEMO: "yes" })).toBe("DEMO isn't on");
  });

  it("never runs on a site with a Discord bot or server", () => {
    expect(demoRefusal({ DEMO: "on", DISCORD_GUILD_ID: "100000000000000001" })).toMatch(/DISCORD_GUILD_ID is set/);
    expect(demoRefusal({ DEMO: "on", DISCORD_BOT_TOKEN: "x", DISCORD_GUILD_ID: "100000000000000001" })).toMatch(/DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are set/);
  });
});

describe("isDemoMember", () => {
  it("is only the made-up members", () => {
    expect(["u-sam", "u-alex", "u-jordan", "u-casey"].every(isDemoMember)).toBe(true);
    expect(isDemoMember("u-riley")).toBe(false);
    expect(isDemoMember("")).toBe(false);
  });
});

describe("demoCalendar", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  // A Monday, a Wednesday, a Thursday (the next Friday is too close to plan for) and a Friday
  const mornings = ["2026-10-26T09:00:00Z", "2026-10-28T09:00:00Z", "2026-10-29T09:00:00Z", "2026-10-30T09:00:00Z"].map((iso) => new Date(iso));

  it("puts every past night before today, and the next ones from today on", () => {
    for (const now of mornings) {
      const cal = demoCalendar(now);
      const today = now.toISOString().slice(0, 10);
      expect([...cal.core, ...cal.casual].every((n) => n.date < today)).toBe(true);
      expect(cal.nextCasual >= today).toBe(true);
    }
  });

  it("plans the next night for a Friday at least two days off, and the one after two weeks later", () => {
    for (const now of mornings) {
      const cal = demoCalendar(now);
      const daysOff = (Date.parse(cal.nextNight) - Date.parse(now.toISOString().slice(0, 10))) / 86_400_000;
      expect(day(cal.nextNight)).toBe(5);
      expect(daysOff).toBeGreaterThanOrEqual(2);
      expect(daysOff).toBeLessThanOrEqual(9);
      expect(Date.parse(cal.nightAfter) - Date.parse(cal.nextNight)).toBe(14 * 86_400_000);
      expect(day(cal.nextCasual)).toBe(3);
    }
  });

  it("offers the poll's dates after both of those", () => {
    const cal = demoCalendar(mornings[0]);
    expect(cal.pollDays).toHaveLength(3);
    expect(cal.pollDays.every((d) => d > cal.nightAfter)).toBe(true);
  });

  it("has about 40 plays of history, most Fridays, and a casual night every other Wednesday", () => {
    const cal = demoCalendar(mornings[0]);
    const plays = cal.core.reduce((n, night) => n + night.games.length, 0);
    expect(plays).toBeGreaterThanOrEqual(35);
    expect(plays).toBeLessThanOrEqual(50);
    expect(cal.core.filter((n) => day(n.date) === 5).length).toBeGreaterThan(cal.core.length / 2);
    expect(cal.casual.every((n) => day(n.date) === 3)).toBe(true);
  });

  it("is the same group whenever it's worked out", () => {
    const [a, b] = [demoCalendar(mornings[0]), demoCalendar(mornings[3])];
    expect(a.core.map((n) => n.games)).toEqual(b.core.map((n) => n.games));
  });
});
