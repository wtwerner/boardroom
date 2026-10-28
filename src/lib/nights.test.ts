import { describe, expect, it } from "vitest";
import { monthLabel, nightTitle, nightWhen, recentMonths, tableFor, zonedToUtc } from "./nights";

describe("zonedToUtc", () => {
  it("reads a date and time in the group's time zone", () => {
    // Central Daylight Time is UTC−5, Central Standard Time UTC−6
    expect(zonedToUtc("2026-10-29", "19:00", "America/Chicago").toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(zonedToUtc("2026-12-03", "19:30", "America/Chicago").toISOString()).toBe("2026-12-04T01:30:00.000Z");
  });

  it("copes with the day clocks change", () => {
    expect(zonedToUtc("2026-11-01", "19:00", "America/Chicago").toISOString()).toBe("2026-11-02T01:00:00.000Z");
    expect(zonedToUtc("2026-03-08", "12:00", "America/Chicago").toISOString()).toBe("2026-03-08T17:00:00.000Z");
  });

  it("works in other zones", () => {
    expect(zonedToUtc("2026-07-01", "20:00", "Europe/London").toISOString()).toBe("2026-07-01T19:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "20:00", "UTC").toISOString()).toBe("2026-07-01T20:00:00.000Z");
  });
});

describe("tableFor", () => {
  it("counts members once and everyone else as others", () => {
    const going = [
      { name: "Sam", playerId: 1, userId: "u-sam" },
      { name: "Riley", playerId: 3, userId: null },
      { name: "Drew", playerId: 4, userId: null },
      { name: "sam", playerId: 1, userId: "u-sam" },
    ];
    expect(tableFor(going, 1)).toEqual({ memberIds: ["u-sam"], others: 3 });
  });
});

describe("nightWhen", () => {
  it("reads the start in the group's time zone, and round-trips through zonedToUtc", () => {
    const when = nightWhen("2026-10-30T00:00:00.000Z", "America/Chicago");
    expect(when).toEqual({ month: "OCT", day: "29", weekday: "Thu", year: "2026", time: "7:00 PM", label: "Thu, Oct 29", date: "2026-10-29", clock: "19:00" });
    expect(zonedToUtc(when.date, when.clock, "America/Chicago").toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });
});

describe("nightTitle", () => {
  it("names a night by its date and kind when the group hasn't set a template", () => {
    expect(nightTitle("core", "2026-10-18")).toBe("10/18 Game Night");
    expect(nightTitle("casual", "2025-09-03", "Root")).toBe("9/3 Casual Night");
  });
});

describe("recentMonths", () => {
  it("is the last twelve months up to this one, across the new year", () => {
    expect(recentMonths("2026-10-24")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(recentMonths("2026-01-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("monthLabel", () => {
  it("names the month, with the year when asked", () => {
    expect(monthLabel("2025-11")).toBe("Nov");
    expect(monthLabel("2026-01", true)).toBe("Jan '26");
  });
});
