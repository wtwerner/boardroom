import { describe, expect, it } from "vitest";
import { componentText } from "./discord-message";
import { NIGHT_ACCENT } from "./discord-components";
import { parseActionId } from "./interactions";
import { nightPing } from "./night-message";
import { type PollCard, buildPollMessage, buildPollThreadCopy, dateChoiceLabel, pickedMessage, pollThreadName, rankDates, refindMessage } from "./poll-message";

const sam = { name: "Sam", discordId: "10000000000000001" };
const alex = { name: "Alex", discordId: "10000000000000002" };

const base: PollCard = {
  id: 3,
  title: "November heavy",
  location: "Sam's place",
  status: "open",
  kind: "core",
  kindName: null,
  dates: [
    { id: 21, startsAt: "2026-11-06T01:00:00.000Z", past: false, voters: [sam, alex] },
    { id: 22, startsAt: "2026-11-07T20:00:00.000Z", past: false, voters: [] },
  ],
  pollUrl: "https://boardroom.example/plan#poll-3",
  siteName: "Boardroom",
};

type Built = ReturnType<typeof buildPollMessage>;
type Button = { label?: string; style?: number; custom_id?: string; url?: string };
const allButtons = (m: Built) => {
  const out: Button[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const node = c as { type?: number; accessory?: unknown; components?: unknown[] };
    if (node.type === 2) out.push(node as Button);
    walk(node.accessory);
    node.components?.forEach(walk);
  };
  m.components.forEach(walk);
  return out;
};
const countParts = (m: Built) => {
  let n = 0;
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    n++;
    const node = c as { accessory?: unknown; components?: unknown[] };
    walk(node.accessory);
    node.components?.forEach(walk);
  };
  m.components.forEach(walk);
  return n;
};

describe("buildPollMessage", () => {
  it("lists each date in each reader's own time zone, with who it works for", () => {
    const text = componentText(buildPollMessage(base).components);
    expect(text).toContain("## November heavy\n-# Picking a date");
    expect(text).toContain("📍 Sam's place");
    expect(text).toContain("📅 **<t:1793926800:F>** · 2\n> <@10000000000000001>, <@10000000000000002>");
    expect(text).toContain("📅 **<t:1794081600:F>** · 0\n-# Nobody yet");
  });

  it("puts Works for me beside each date, and suggest, pick, call off and the site's link below", () => {
    const buttons = allButtons(buildPollMessage(base));
    expect(buttons.filter((b) => b.label === "Works for me").map((b) => parseActionId(b.custom_id))).toEqual([
      { kind: "pollVote", optionId: 21 },
      { kind: "pollVote", optionId: 22 },
    ]);
    expect(buttons.slice(2).map((b) => b.label)).toEqual(["Suggest a date", "Pick the date", "Call it off", "Open in Boardroom"]);
    expect(parseActionId(buttons[3].custom_id)).toEqual({ kind: "pollPick", pollId: 3 });
    expect(buttons.at(-1)?.url).toBe("https://boardroom.example/plan#poll-3");
  });

  it("leaves the site's link off when there's none to give, as for a casual night's poll", () => {
    expect(allButtons(buildPollMessage({ ...base, pollUrl: null })).map((b) => b.label)).toEqual(["Works for me", "Works for me", "Suggest a date", "Pick the date", "Call it off"]);
  });

  it("strikes a date that's gone by and takes its button away", () => {
    const m = buildPollMessage({ ...base, dates: [{ ...base.dates[0], past: true }, base.dates[1]] });
    expect(componentText(m.components)).toContain("📅 ~~<t:1793926800:F>~~ · gone by");
    expect(allButtons(m).filter((b) => b.label === "Works for me")).toHaveLength(1);
  });

  it("shows a poll that was called off with only Reopen, and one that ran out of dates without buttons", () => {
    const off = buildPollMessage({ ...base, status: "cancelled" });
    expect(componentText(off.components)).toContain("## ~~November heavy~~\n🚫 **Called off**");
    expect(allButtons(off).map((b) => parseActionId(b.custom_id))).toEqual([{ kind: "pollReopen", pollId: 3 }]);
    const offAndGone = buildPollMessage({ ...base, status: "cancelled", dates: base.dates.map((d) => ({ ...d, past: true })) });
    expect(allButtons(offAndGone)).toEqual([]);
    const closed = buildPollMessage({ ...base, status: "closed" });
    expect(componentText(closed.components)).toContain("Every date has gone by.");
    expect(allButtons(closed)).toEqual([]);
  });

  it("names the kind of night when the group has two, in its color", () => {
    const m = buildPollMessage({ ...base, kind: "casual", kindName: "Game night" });
    expect(componentText(m.components)).toContain("-# Picking a date · Game night");
    expect(m.components[0]).toMatchObject({ accent_color: NIGHT_ACCENT.casual });
  });

  it("pings above the card on the first post only", () => {
    const m = buildPollMessage(base, nightPing("10000000000000009"));
    expect(m.components[0]).toEqual({ type: 10, content: "<@&10000000000000009>" });
    expect(buildPollMessage(base).components[0]).toMatchObject({ type: 17 });
  });

  it("fits Discord's 40 parts with the most dates a poll can have", () => {
    const dates = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, startsAt: `2026-11-${10 + i}T01:00:00.000Z`, past: false, voters: [sam] }));
    expect(countParts(buildPollMessage({ ...base, dates }, nightPing("here")))).toBeLessThanOrEqual(40);
  });
});

describe("rankDates", () => {
  it("puts the most votes first, then the soonest, leaving out dates gone by", () => {
    const dates = [
      { id: 1, startsAt: "2026-11-08T01:00:00.000Z", past: false, voters: [sam] },
      { id: 2, startsAt: "2026-11-06T01:00:00.000Z", past: false, voters: [sam] },
      { id: 3, startsAt: "2026-11-09T01:00:00.000Z", past: false, voters: [sam, alex] },
      { id: 4, startsAt: "2026-11-01T01:00:00.000Z", past: true, voters: [sam, alex] },
    ];
    expect(rankDates(dates).map((d) => d.id)).toEqual([3, 2, 1]);
  });
});

describe("dateChoiceLabel", () => {
  it("reads in the group's time zone, with how many it works for", () => {
    expect(dateChoiceLabel("2026-11-06T01:00:00.000Z", 3, "America/Chicago")).toBe("Thu, Nov 5, 7:00 PM · 3 can make it");
    expect(dateChoiceLabel("2026-11-06T01:00:00.000Z", 0, "America/Chicago")).toBe("Thu, Nov 5, 7:00 PM · nobody yet");
  });
});

describe("pickedMessage", () => {
  it("pings the group's role and the people the date works for, who are down as going", () => {
    const { body, allowedMentions } = pickedMessage({ title: "November heavy", startsAt: "2026-11-06T01:00:00.000Z", voters: [sam, { name: "Riley" }] }, nightPing("10000000000000009"));
    expect(body.content).toBe(
      "<@&10000000000000009> **November heavy** is set for <t:1793926800:F> (<t:1793926800:R>).\n<@10000000000000001>, you said that one works, so you're down as going. If you can't make it now, change it on the post. Everyone else, say if you're coming.",
    );
    expect(allowedMentions).toEqual({ parse: [], roles: ["10000000000000009"], users: ["10000000000000001"] });
  });

  it("still says it's set when nobody's pinged", () => {
    const { body, allowedMentions } = pickedMessage({ title: "November heavy", startsAt: "2026-11-06T01:00:00.000Z", voters: [] }, null);
    expect(body.content).toBe("**November heavy** is set for <t:1793926800:F> (<t:1793926800:R>).\nSay if you're coming on the post.");
    expect(allowedMentions).toEqual({ parse: [], users: [] });
  });
});

describe("refindMessage", () => {
  it("says which date fell through, pings whoever was going, and says the games come back", () => {
    const { body, allowedMentions } = refindMessage({ by: "<@10000000000000003>", was: "2026-11-06T01:00:00.000Z", going: [sam, alex, { name: "Riley" }], games: 2, night: "core" });
    expect(body.content).toBe(
      "↩️ <@10000000000000003> moved this back to finding a date: <t:1793926800:F> didn't work out.\n<@10000000000000001>, <@10000000000000002>, you were going. Say which dates work for you on the post.\nThe 2 games proposed for it come back once a date's picked.",
    );
    expect(allowedMentions).toEqual({ parse: [], users: ["10000000000000001", "10000000000000002"] });
  });

  it("says one game comes back", () => {
    expect(refindMessage({ by: "**Sam**", was: "2026-11-06T01:00:00.000Z", going: [], games: 1, night: "core" }).body.content).toContain("\nThe game proposed for it comes back once a date's picked.");
  });

  it("calls a casual night's games the ones people are bringing", () => {
    const note = (games: number) => refindMessage({ by: "**Sam**", was: "2026-11-06T01:00:00.000Z", going: [], games, night: "casual" }).body.content;
    expect(note(3)).toContain("\nThe 3 games people are bringing come back once a date's picked.");
    expect(note(1)).toContain("\nThe game someone's bringing comes back once a date's picked.");
  });

  it("leaves out the ping and the games when there are none", () => {
    const { body } = refindMessage({ by: "**Sam**", was: "2026-11-06T01:00:00.000Z", going: [], games: 0, night: "core" });
    expect(body.content).toBe("↩️ **Sam** moved this back to finding a date: <t:1793926800:F> didn't work out.");
  });
});

describe("buildPollThreadCopy", () => {
  it("is each date to come with how many it works for, and the post's buttons, without the card", () => {
    const copy = buildPollThreadCopy({ ...base, dates: [{ id: 20, startsAt: "2026-11-01T01:00:00.000Z", past: true, voters: [] }, ...base.dates] });
    expect(componentText(copy.components)).toBe("📅 <t:1793926800:F> · 2\n📅 <t:1794081600:F> · 0");
    expect(copy.components.some((c) => c.type === 17)).toBe(false);
    expect(allButtons(copy)).toEqual(allButtons(buildPollMessage(base)));
  });

  it("says when it's called off, with Reopen while a date's still to come", () => {
    const copy = buildPollThreadCopy({ ...base, status: "cancelled" });
    expect(componentText(copy.components)).toBe("-# 🚫 Called off");
    expect(allButtons(copy).map((b) => b.label)).toEqual(["Reopen"]);
  });
});

describe("pollThreadName", () => {
  it("says what the thread is for, within Discord's 100 characters", () => {
    expect(pollThreadName("November heavy")).toBe("Picking a date · November heavy");
    expect(pollThreadName("x".repeat(200))).toHaveLength(100);
  });
});
