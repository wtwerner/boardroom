import { describe, expect, it } from "vitest";
import { componentText } from "./discord-message";
import { NIGHT_ACCENT } from "./discord-components";
import { parseActionId } from "./interactions";
import { nightPing } from "./night-message";
import { type PollCard, buildPollMessage, buildPollThreadCopy, dateChoiceLabel, everyoneAnsweredMessage, nudgeMessage, pickedMessage, pollThreadName, refindMessage, stayingLine } from "./poll-message";

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
    { id: 21, startsAt: "2026-11-06T01:00:00.000Z", past: false, yes: [sam], maybe: [alex] },
    { id: 22, startsAt: "2026-11-07T20:00:00.000Z", past: false, yes: [], maybe: [] },
  ],
  pollUrl: "https://boardroom.example/events/12",
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
  it("lists each date in each reader's own time zone, with who can come and who only if they have to", () => {
    const text = componentText(buildPollMessage(base).components);
    expect(text).toContain("## November heavy\n-# Date TBD");
    expect(text).toContain("📍 Sam's place\nTap **Works for me** on each date you could make. The rest count as can't.");
    expect(text).toContain("📅 **<t:1793926800:F>** · 2 can come\n> <@10000000000000001>\n-# If they have to: <@10000000000000002>");
    expect(text).toContain("📅 **<t:1794081600:F>** · 0 can come\n-# Nobody yet");
  });

  it("puts Works for me beside each date, and suggest, set, none work, call off and the site's link below", () => {
    const buttons = allButtons(buildPollMessage(base));
    expect(buttons.filter((b) => b.label === "Works for me").map((b) => parseActionId(b.custom_id))).toEqual([
      { kind: "pollVote", optionId: 21 },
      { kind: "pollVote", optionId: 22 },
    ]);
    expect(buttons.slice(2).map((b) => b.label)).toEqual(["Suggest a date", "Set the date", "None work", "Call it off", "Open in Boardroom"]);
    expect(parseActionId(buttons[3].custom_id)).toEqual({ kind: "pollPick", pollId: 3 });
    expect(parseActionId(buttons[4].custom_id)).toEqual({ kind: "pollNone", pollId: 3 });
    expect(buttons.at(-1)?.url).toBe("https://boardroom.example/events/12");
  });

  it("leaves the site's link off when there's none to give, as for a casual night", () => {
    expect(allButtons(buildPollMessage({ ...base, pollUrl: null })).map((b) => b.label)).toEqual(["Works for me", "Works for me", "Suggest a date", "Set the date", "None work", "Call it off"]);
  });

  it("moves a date that's gone by or fell through below, small, without a button", () => {
    const m = buildPollMessage({ ...base, dates: [{ ...base.dates[0], past: true }, base.dates[1], { id: 23, startsAt: "2026-10-30T00:00:00.000Z", past: true, fellThrough: true, yes: [sam], maybe: [] }] });
    const text = componentText(m.components);
    expect(text).toContain("-# ~~<t:1793318400:F>~~ fell through\n-# Gone by: <t:1793926800:f>");
    expect(allButtons(m).filter((b) => b.label === "Works for me")).toHaveLength(1);
  });

  it("shows one called off with only Reopen, and one that ran out of dates with suggest and call off", () => {
    const off = buildPollMessage({ ...base, status: "cancelled" });
    expect(componentText(off.components)).toContain("## ~~November heavy~~\n🚫 **Called off**");
    expect(allButtons(off).map((b) => parseActionId(b.custom_id))).toEqual([{ kind: "pollReopen", pollId: 3 }]);
    const offAndGone = buildPollMessage({ ...base, status: "cancelled", dates: base.dates.map((d) => ({ ...d, past: true })) });
    expect(allButtons(offAndGone)).toEqual([]);
    const closed = buildPollMessage({ ...base, status: "closed" });
    expect(componentText(closed.components)).toContain("Every date's gone by. Suggest another, or call it off.");
    expect(allButtons(closed).map((b) => b.label)).toEqual(["Suggest a date", "Call it off", "Open in Boardroom"]);
  });

  it("names the kind of night when the group has two, in its color", () => {
    const m = buildPollMessage({ ...base, kind: "casual", kindName: "Game night" });
    expect(componentText(m.components)).toContain("-# Date TBD · Game night");
    expect(m.components[0]).toMatchObject({ accent_color: NIGHT_ACCENT.casual });
  });

  it("pings above the card on the first post only", () => {
    const m = buildPollMessage(base, nightPing("10000000000000009"));
    expect(m.components[0]).toEqual({ type: 10, content: "<@&10000000000000009>" });
    expect(buildPollMessage(base).components[0]).toMatchObject({ type: 17 });
  });

  it("fits Discord's 40 parts with the most dates on offer, and some that fell through", () => {
    const dates = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, startsAt: `2026-11-${10 + i}T01:00:00.000Z`, past: false, yes: [sam], maybe: [alex] })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: i + 20, startsAt: `2026-11-0${1 + i}T01:00:00.000Z`, past: true, fellThrough: true, yes: [], maybe: [] })),
    ];
    expect(countParts(buildPollMessage({ ...base, dates }, nightPing("here")))).toBeLessThanOrEqual(40);
  });
});

describe("dateChoiceLabel", () => {
  it("reads in the group's time zone, with how many can come", () => {
    expect(dateChoiceLabel("2026-11-06T01:00:00.000Z", 3, "America/Chicago")).toBe("Thu, Nov 5, 7:00 PM · 3 can come");
    expect(dateChoiceLabel("2026-11-06T01:00:00.000Z", 0, "America/Chicago")).toBe("Thu, Nov 5, 7:00 PM · nobody yet");
  });
});

describe("pickedMessage", () => {
  it("pings the group's role and the people coming, down as they answered", () => {
    const { body, allowedMentions } = pickedMessage({ title: "November heavy", startsAt: "2026-11-06T01:00:00.000Z", going: [sam, { name: "Riley" }], maybe: [alex] }, nightPing("10000000000000009"));
    expect(body.content).toBe(
      "<@&10000000000000009> **November heavy** is set for <t:1793926800:F> (<t:1793926800:R>).\n<@10000000000000001> is down as going, since that date works for them.\n<@10000000000000002> is down as a maybe.\nAnyone else, say on the post if you're coming.",
    );
    expect(allowedMentions).toEqual({ parse: [], roles: ["10000000000000009"], users: ["10000000000000001", "10000000000000002"] });
  });

  it("lists several people who are going with an and", () => {
    const riley = { name: "Riley", discordId: "10000000000000004" };
    const { body } = pickedMessage({ title: "November heavy", startsAt: "2026-11-06T01:00:00.000Z", going: [sam, alex, riley], maybe: [] }, null);
    expect(body.content).toContain("\n<@10000000000000001>, <@10000000000000002> and <@10000000000000004> are down as going, since that date works for them.\nAnyone else");
  });

  it("still says it's set when nobody's pinged", () => {
    const { body, allowedMentions } = pickedMessage({ title: "November heavy", startsAt: "2026-11-06T01:00:00.000Z", going: [], maybe: [] }, null);
    expect(body.content).toBe("**November heavy** is set for <t:1793926800:F> (<t:1793926800:R>).\nSay if you're coming on the post.");
    expect(allowedMentions).toEqual({ parse: [], users: [] });
  });
});

describe("refindMessage", () => {
  it("says which date fell through, and pings whoever was going to check the other dates", () => {
    const { body, allowedMentions } = refindMessage({ by: "<@10000000000000003>", was: "2026-11-06T01:00:00.000Z", going: [sam, alex, { name: "Riley" }] });
    expect(body.content).toBe(
      "↩️ <@10000000000000003> says <t:1793926800:F> fell through, so this is finding a date again.\n<@10000000000000001> and <@10000000000000002>, you were going. Check which dates work for you on the post.",
    );
    expect(allowedMentions).toEqual({ parse: [], users: ["10000000000000001", "10000000000000002"] });
  });

  it("leaves out the ping when nobody was going", () => {
    const { body } = refindMessage({ by: "**Sam**", was: "2026-11-06T01:00:00.000Z", going: [] });
    expect(body.content).toBe("↩️ **Sam** says <t:1793926800:F> fell through, so this is finding a date again.");
  });
});

describe("stayingLine", () => {
  const tz = "America/Chicago";
  it("names the dates that stay, by day", () => {
    expect(stayingLine(["2026-11-09T01:30:00.000Z", "2026-11-16T01:30:00.000Z"], tz)).toBe("Sun Nov 8 and Sun Nov 15 stay on offer, with their answers. Add more, or none.");
    expect(stayingLine(["2026-11-09T01:30:00.000Z"], tz)).toBe("Sun Nov 8 stays on offer, with its answers. Add more, or none.");
  });

  it("counts them when naming them won't fit, and asks for dates when none stay", () => {
    const many = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 9 + i, 1, 30)).toISOString());
    expect(stayingLine(many, tz)).toBe("Its 7 other dates stay on offer, with their answers. Add more, or none.");
    expect(stayingLine([], tz)).toBe("A date or two to offer instead of this one.");
  });
});

describe("buildPollThreadCopy", () => {
  it("is each date on offer with how many can come, and the post's buttons, without the card", () => {
    const copy = buildPollThreadCopy({ ...base, dates: [{ id: 20, startsAt: "2026-11-01T01:00:00.000Z", past: true, yes: [], maybe: [] }, ...base.dates] });
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
  it("says the date's to be decided, within Discord's 100 characters", () => {
    expect(pollThreadName("November heavy")).toBe("Date TBD · November heavy");
    expect(pollThreadName("x".repeat(200))).toHaveLength(100);
  });
});

describe("who's answered, on the post", () => {
  it("says how many members have answered and who it's waiting on, and each date's standing", () => {
    const m = buildPollMessage({
      ...base,
      min: 3,
      progress: { answered: 2, of: 4, waiting: [{ name: "Jordan", discordId: "10000000000000003" }, { name: "Casey" }] },
      dates: [
        { ...base.dates[0], verdict: "best" },
        { ...base.dates[1], yes: [sam], verdict: "few" },
      ],
    });
    const text = componentText(m.components);
    expect(text).toContain("-# 2 of 4 answered · waiting on <@10000000000000003> and Casey");
    expect(text).toContain("📅 **<t:1793926800:F>** · 2 can come · best so far");
    expect(text).toContain("📅 **<t:1794081600:F>** · 1 can come · too few (needs 3)");
    expect(componentText(buildPollThreadCopy({ ...base, dates: [{ ...base.dates[0], verdict: "everyone" }] }).components)).toBe("📅 <t:1793926800:F> · everyone can come (2)");
    expect(componentText(buildPollMessage({ ...base, dates: [{ ...base.dates[0], verdict: "everyone" }] }).components)).toContain("📅 **<t:1793926800:F>** · everyone can come (2)\n");
  });

  it("says when everyone's answered", () => {
    expect(componentText(buildPollMessage({ ...base, progress: { answered: 4, of: 4, waiting: [] } }).components)).toContain("-# Everyone's answered");
  });
});

describe("everyoneAnsweredMessage", () => {
  it("names the best date and pings whoever started it to set it", () => {
    const { body, allowedMentions } = everyoneAnsweredMessage({ starter: sam, best: { startsAt: "2026-11-06T01:00:00.000Z", coming: 5, everyone: false }, min: 2 });
    expect(body.content).toBe("✅ Everyone's answered. <t:1793926800:F> works best: 5 can come.\n<@10000000000000001>, set the date on the post when you're ready.");
    expect(allowedMentions).toEqual({ parse: [], users: ["10000000000000001"] });
  });

  it("says when a date works for everyone, and when none has enough", () => {
    expect(everyoneAnsweredMessage({ starter: null, best: { startsAt: "2026-11-06T01:00:00.000Z", coming: 4, everyone: true }, min: 2 }).body.content).toBe(
      "✅ Everyone's answered, and <t:1793926800:F> works for all of them.\nSet the date on the post when you're ready.",
    );
    expect(everyoneAnsweredMessage({ starter: alex, best: null, min: 3 }).body.content).toBe("✅ Everyone's answered, but no date has 3 who can come.\n<@10000000000000002>, suggest another date on the post, or call it off.");
  });
});

describe("nudgeMessage", () => {
  it("pings the members still waiting", () => {
    const { body, allowedMentions } = nudgeMessage([alex, { name: "Casey" }], "**Sam**");
    expect(body.content).toBe("👋 **Sam** is waiting on <@10000000000000002> and Casey: say which dates work on the post.");
    expect(allowedMentions).toEqual({ parse: [], users: ["10000000000000002"] });
  });
});
