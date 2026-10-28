import { describe, expect, it } from "vitest";
import { logNudgeDm, logNudgeDue, reminderDue, reminderMessage } from "./nudges";

const TZ = "America/Chicago";
// Thursday Oct 29, 7pm in Chicago
const startsAt = new Date("2026-10-30T00:00:00.000Z");
const night = { startsAt, date: "2026-10-29", createdAt: new Date("2026-10-20T15:00:00.000Z"), cancelled: false };
const at = (iso: string) => new Date(iso);

describe("reminderDue", () => {
  it("is due from the set number of hours before until it starts", () => {
    expect(reminderDue(night, at("2026-10-29T20:59:00.000Z"), 3)).toBe(false);
    expect(reminderDue(night, at("2026-10-29T21:00:00.000Z"), 3)).toBe(true);
    expect(reminderDue(night, at("2026-10-29T23:59:00.000Z"), 3)).toBe(true);
    expect(reminderDue(night, startsAt, 3)).toBe(false);
  });

  it("isn't due when it's off, cancelled, or the night was made inside the window", () => {
    const now = at("2026-10-29T22:00:00.000Z");
    expect(reminderDue(night, now, 0)).toBe(false);
    expect(reminderDue({ ...night, cancelled: true }, now, 3)).toBe(false);
    expect(reminderDue({ ...night, createdAt: at("2026-10-29T21:30:00.000Z") }, now, 3)).toBe(false);
  });
});

describe("logNudgeDue", () => {
  it("waits for 10am the next day in the group's time zone", () => {
    // 4am Friday in Chicago
    expect(logNudgeDue(night, at("2026-10-30T09:00:00.000Z"), TZ)).toBe(false);
    // 10am Friday
    expect(logNudgeDue(night, at("2026-10-30T15:00:00.000Z"), TZ)).toBe(true);
  });

  it("doesn't DM late in the evening, and tries again the next morning", () => {
    // 9pm Friday, then 10am Saturday
    expect(logNudgeDue(night, at("2026-10-31T02:00:00.000Z"), TZ)).toBe(false);
    expect(logNudgeDue(night, at("2026-10-31T15:00:00.000Z"), TZ)).toBe(true);
  });

  it("waits until the night's page shows the log form", () => {
    // Starts 11pm Thursday, so its page turns at 11am Friday
    const late = { ...night, startsAt: at("2026-10-30T04:00:00.000Z") };
    expect(logNudgeDue(late, at("2026-10-30T15:00:00.000Z"), TZ)).toBe(false);
    expect(logNudgeDue(late, at("2026-10-30T16:00:00.000Z"), TZ)).toBe(true);
  });

  it("leaves nights from more than three days ago and cancelled ones alone", () => {
    expect(logNudgeDue(night, at("2026-11-02T15:00:00.000Z"), TZ)).toBe(false);
    expect(logNudgeDue({ ...night, cancelled: true }, at("2026-10-30T15:00:00.000Z"), TZ)).toBe(false);
  });
});

describe("reminderMessage", () => {
  it("says when and where, and pings everyone in Discord once", () => {
    const m = reminderMessage({
      title: "Thursday_heavy",
      startsAt,
      location: "Sam's",
      people: [
        { name: "Sam", discordId: "100000000000000001" },
        { name: "Alex", discordId: null },
        { name: "Jordan", discordId: "100000000000000003" },
        { name: "Sam", discordId: "100000000000000001" },
      ],
    });
    expect(m.body.content).toBe("⏰ **Thursday\\_heavy** starts <t:1793318400:R>, at <t:1793318400:t> · 📍 Sam's\n<@100000000000000001> <@100000000000000003>");
    expect(m.allowedMentions).toEqual({ parse: [], users: ["100000000000000001", "100000000000000003"] });
  });

  it("reminds whoever's bringing games which ones, without pinging them twice", () => {
    const m = reminderMessage({
      title: "Casual night",
      startsAt,
      location: null,
      people: [
        { name: "Sam", discordId: "100000000000000001" },
        { name: "Jordan", discordId: "100000000000000003" },
      ],
      bringing: [
        { name: "Sam", discordId: "100000000000000001", game: "Azul" },
        { name: "Casey", discordId: null, game: "Wingspan" },
        { name: "Sam", discordId: "100000000000000001", game: "Cascadia" },
      ],
    });
    expect(m.body.content).toBe(
      "⏰ **Casual night** starts <t:1793318400:R>, at <t:1793318400:t>\n🎲 Don't forget your games: <@100000000000000001> **Azul**, **Cascadia** · Casey **Wingspan**\n<@100000000000000003>",
    );
    expect(m.allowedMentions).toEqual({ parse: [], users: ["100000000000000001", "100000000000000003"] });
  });

  it("is one line when nobody's in Discord", () => {
    expect(reminderMessage({ title: "Game night", startsAt, location: null, people: [] }).body.content).toBe("⏰ **Game night** starts <t:1793318400:R>, at <t:1793318400:t>");
  });
});

describe("logNudgeDm", () => {
  it("links to the night's page", () => {
    expect(logNudgeDm({ title: "Game night", url: "https://boardroom.example/events/30#log", siteName: "Boardroom" }).content).toContain(
      "[Log what you played](<https://boardroom.example/events/30#log>)",
    );
  });

  it("names the site when its address isn't known", () => {
    expect(logNudgeDm({ title: "Game night", url: null, siteName: "Boardroom" }).content).toContain("on its page in Boardroom");
  });
});
