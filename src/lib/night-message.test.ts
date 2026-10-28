import { describe, expect, it } from "vitest";
import { componentText } from "./discord-message";
import { type NightCard, buildNightMessage, buildNightThreadCopy, changeNote, movedMessage, nightPing, threadName } from "./night-message";
import { parseActionId } from "./interactions";

const base: NightCard = {
  id: 12,
  title: "Thursday heavy",
  startsAt: "2026-10-30T00:00:00.000Z",
  location: "Sam's place",
  capacity: null,
  cancelled: false,
  kind: "core",
  kindName: null,
  going: [{ name: "Sam", discordId: "10000000000000001", guests: 1 }, { name: "Riley" }],
  maybe: [{ name: "Alex", discordId: "10000000000000002" }],
  declined: [],
  others: 0,
  plan: { kind: "vote", lockedIn: null, proposals: [] },
  planUrl: "https://boardroom.example/events/12",
  siteName: "Boardroom",
};

type Built = ReturnType<typeof buildNightMessage>;
type Button = { label?: string; style?: number; emoji?: { id?: string; name: string }; custom_id?: string; url?: string };
const rows = (m: Built) => m.components.filter((c) => c.type === 1).map((c) => (c as { components: Button[] }).components);
const buttons = (m: Built) => rows(m).flat();

describe("buildNightMessage", () => {
  it("shows when and where in each reader's own time zone", () => {
    const text = componentText(buildNightMessage(base).components);
    expect(text).toContain("## Thursday heavy");
    expect(text).toContain("📅 <t:1793318400:F>\n⏳ <t:1793318400:R>\n📍 Sam's place");
  });

  it("lists who's coming in a quote, with mentions, guests and others counted by hand", () => {
    const text = componentText(buildNightMessage({ ...base, others: 2, capacity: 6 }).components);
    expect(text).toContain("✅ **Going** · 5/6\n> <@10000000000000001> +1\n> Riley\n> -# and 2 others");
    expect(text).toContain("❔ **Maybe** · 1\n> <@10000000000000002>");
    expect(text).not.toContain("Can't make it");
  });

  it("runs the maybes together on one line", () => {
    const text = componentText(buildNightMessage({ ...base, maybe: [{ name: "Alex", discordId: "10000000000000002" }, { name: "Casey" }] }).components);
    expect(text).toContain("❔ **Maybe** · 2\n> <@10000000000000002>, Casey");
  });

  it("counts others without names when nobody named is going", () => {
    const text = componentText(buildNightMessage({ ...base, going: [], others: 1 }).components);
    expect(text).toContain("✅ **Going** · 1\n> -# 1 other");
  });

  it("leaves the place off when there isn't one", () => {
    expect(componentText(buildNightMessage({ ...base, location: null }).components)).not.toContain("📍");
  });

  it("says when nobody has answered", () => {
    const text = componentText(buildNightMessage({ ...base, going: [], maybe: [] }).components);
    expect(text).toContain("✅ **Going** · 0\n-# Nobody yet");
  });

  it("has a button for each answer, as the symbol its list goes by, and for someone else, then Edit and a link to plan it", () => {
    const [answers, more] = rows(buildNightMessage(base));
    expect(answers.map((x) => x.label ?? x.emoji?.name)).toEqual(["✅", "❔", "❌", "Someone else…"]);
    // All grey: a green Going would hide its green check
    expect(new Set(answers.map((x) => x.style))).toEqual(new Set([2]));
    expect(answers.map((x) => parseActionId(x.custom_id))).toEqual([
      { kind: "rsvp", nightId: 12, status: "going" },
      { kind: "rsvp", nightId: 12, status: "maybe" },
      { kind: "rsvp", nightId: 12, status: "declined" },
      { kind: "for", nightId: 12 },
    ]);
    expect(more.map((x) => x.label)).toEqual(["Edit", "Plan it in Boardroom"]);
    expect(parseActionId(more[0].custom_id)).toEqual({ kind: "edit", nightId: 12 });
    expect(more[1].url).toBe(base.planUrl);
  });

  it("leaves the site link off where most people can't open it", () => {
    expect(buttons(buildNightMessage({ ...base, planUrl: null })).map((x) => x.label)).not.toContain("Plan it in Boardroom");
  });

  it("names the kind of night when the group has more than one", () => {
    expect(componentText(buildNightMessage({ ...base, kindName: "Casual night" }).components)).toContain("-# Casual night");
  });

  it("shows the game that's locked in, with its box", () => {
    const m = buildNightMessage({ ...base, plan: { kind: "vote", lockedIn: { name: "Brass: Birmingham", bggId: 224517, imageUrl: "https://img.example/brass.jpg" }, proposals: [] } });
    expect(componentText(m.components)).toContain("🎲 **Playing**\n[Brass: Birmingham](https://boardgamegeek.com/boardgame/224517)");
    expect(JSON.stringify(m.components)).toContain("https://img.example/brass.jpg");
  });

  it("lists proposals by votes until one is locked in, without their boxes", () => {
    const m = buildNightMessage({
      ...base,
      plan: { kind: "vote", lockedIn: null, proposals: [{ name: "Ark Nova", votes: 1, imageUrl: "https://img.example/ark.jpg" }, { name: "Brass", votes: 3, imageUrl: "https://img.example/brass.jpg" }] },
    });
    expect(componentText(m.components)).toContain("🗳️ **Proposed**\nBrass · 3 votes\nArk Nova · 1 vote");
    expect(JSON.stringify(m.components)).not.toContain("img.example");
  });

  it("lists what's being brought on a casual night", () => {
    const text = componentText(
      buildNightMessage({
        ...base,
        plan: {
          kind: "bring",
          games: [
            { name: "Cascadia", bringer: { name: "Jordan", discordId: "10000000000000004" } },
            { name: "Catan", bringer: null },
            { name: "Azul", bringer: { name: "Casey" } },
            { name: "Wingspan", bggId: 266192, bringer: { name: "Jordan", discordId: "10000000000000004" } },
          ],
        },
      }).components,
    );
    expect(text).toContain("🎲 **Bringing**\n<@10000000000000004> · Cascadia, [Wingspan](https://boardgamegeek.com/boardgame/266192)\nCasey · Azul\nCatan");
  });

  it("leaves the boxes of what's being brought off", () => {
    const m = buildNightMessage({ ...base, kind: "casual", plan: { kind: "bring", games: [{ name: "Azul", imageUrl: "https://img.example/azul.jpg", bringer: { name: "Casey" } }] } });
    expect(JSON.stringify(m.components)).not.toContain("img.example");
  });

  it("lists games someone's been asked to bring after what's coming, without pinging them", () => {
    const text = componentText(
      buildNightMessage({
        ...base,
        plan: {
          kind: "bring",
          games: [
            { name: "Catan", bringer: null },
            { name: "Azul", bringer: null, asked: { name: "Sam", discordId: "10000000000000001" } },
            { name: "Cascadia", bringer: { name: "Jordan" } },
          ],
        },
      }).components,
    );
    expect(text).toContain("🎲 **Bringing**\nJordan · Cascadia\n-# Asked <@10000000000000001> · Azul\nCatan");
  });

  it("marks a cancelled night and takes its buttons away", () => {
    const m = buildNightMessage({ ...base, cancelled: true });
    expect(componentText(m.components)).toContain("## ~~Thursday heavy~~\n🚫 **Cancelled**");
    expect(buttons(m)).toEqual([]);
  });

  it("uses the bot's own emoji once they're uploaded", () => {
    const m = buildNightMessage({ ...base, emoji: { date: "10000000000000010", going: "10000000000000011" } });
    expect(componentText(m.components)).toContain("<:date:10000000000000010> <t:1793318400:F>\n⏳");
    expect(componentText(m.components)).toContain("<:going:10000000000000011> **Going**");
    expect(rows(m)[0][0].emoji).toEqual({ id: "10000000000000011", name: "going" });
  });

  it("is colored by the kind of night", () => {
    const accent = (m: Built) => (m.components.find((c) => c.type === 17) as { accent_color: number }).accent_color;
    expect(accent(buildNightMessage(base))).not.toBe(accent(buildNightMessage({ ...base, kind: "casual" })));
  });

  it("keeps names from being read as markdown", () => {
    expect(componentText(buildNightMessage({ ...base, going: [{ name: "*Casey*" }] }).components)).toContain("\\*Casey\\*");
  });
});

describe("buildNightThreadCopy", () => {
  it("is a line of counts and the post's buttons, without the card", () => {
    const copy = buildNightThreadCopy({ ...base, capacity: 6, declined: [{ name: "Casey" }] });
    expect(componentText(copy.components)).toBe("-# ✅ 3/6 going · ❔ 1 maybe · ❌ 1 can't");
    expect(copy.components.some((c) => c.type === 17)).toBe(false);
    expect(rows(copy)).toEqual(rows(buildNightMessage(base)));
  });

  it("leaves off answers nobody's given", () => {
    expect(componentText(buildNightThreadCopy({ ...base, going: [], maybe: [] }).components)).toBe("-# ✅ 0 going");
  });

  it("says a cancelled night is, with nothing to press", () => {
    const copy = buildNightThreadCopy({ ...base, cancelled: true });
    expect(componentText(copy.components)).toBe("-# 🚫 Cancelled");
    expect(rows(copy)).toEqual([]);
  });
});

describe("movedMessage", () => {
  it("points to the night's new post, with nothing to press", () => {
    const url = "https://discord.com/channels/10000000000000009/10000000000000008/10000000000000008";
    const m = movedMessage(url);
    expect(componentText(m.components)).toBe(`This event moved: [answer and talk it over in its new post](${url}).`);
    expect(m.components.some((c) => c.type === 1)).toBe(false);
  });
});

describe("threadName", () => {
  it("is the title, when it starts with its date", () => {
    expect(threadName("10/29 Game Night — TBD", base.startsAt, "America/Chicago")).toBe("10/29 Game Night — TBD");
    expect(threadName("10/29/26 Game Night", base.startsAt, "America/Chicago")).toBe("10/29/26 Game Night");
  });

  it("puts the date in front of a title without it", () => {
    expect(threadName("Thursday heavy", base.startsAt, "America/Chicago")).toBe("10/29 Thursday heavy");
    expect(threadName("10/30 Game Night", base.startsAt, "America/Chicago")).toBe("10/29 10/30 Game Night");
    expect(threadName("10/29/25 Game Night", base.startsAt, "America/Chicago")).toBe("10/29 10/29/25 Game Night");
  });

  it("fits Discord's 100 characters", () => {
    expect(threadName("x".repeat(120), base.startsAt, "America/Chicago")).toHaveLength(100);
  });
});

describe("changeNote", () => {
  const before = { startsAt: base.startsAt, location: "Sam's place", title: "Thursday heavy" };

  it("says what moved", () => {
    const note = changeNote(before, { ...before, startsAt: "2026-10-31T00:00:00.000Z", location: "Alex's" }, { name: "Sam", discordId: "10000000000000001" });
    expect(note).toBe("<@10000000000000001> changed the event:\n📅 now <t:1793404800:F> (<t:1793404800:R>)\n📍 now at Alex's");
  });

  it("says nothing when nothing people would notice changed", () => {
    expect(changeNote(before, { ...before }, { name: "Sam" })).toBeNull();
  });
});

describe("nightPing", () => {
  it("pings here, everyone or a role, and nobody otherwise", () => {
    expect(nightPing("here")).toEqual({ text: "@here", allowedMentions: { parse: ["everyone"] } });
    expect(nightPing(" everyone ")).toEqual({ text: "@everyone", allowedMentions: { parse: ["everyone"] } });
    expect(nightPing("10000000000000005")).toEqual({ text: "<@&10000000000000005>", allowedMentions: { parse: [], roles: ["10000000000000005"] } });
    expect(nightPing(undefined)).toBeNull();
    expect(nightPing("")).toBeNull();
    expect(nightPing("the group")).toBeNull();
  });

  it("goes above the card, on the post that pings", () => {
    const m = buildNightMessage(base, nightPing("here"));
    expect(m.components[0]).toEqual({ type: 10, content: "@here" });
    expect(buildNightMessage(base).components[0]).toMatchObject({ type: 17 });
  });
});
