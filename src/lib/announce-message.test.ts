import { describe, expect, it } from "vitest";
import { buildNightAnnouncement, buildPollAnnouncement } from "./announce-message";
import { componentText } from "./discord-message";
import { type NightCard, nightPing } from "./night-message";
import type { PollCard } from "./poll-message";

const sam = { name: "Sam", discordId: "10000000000000001" };
const alex = { name: "Alex", discordId: "10000000000000002" };
const post = "https://discord.com/channels/10000000000000009/10000000000000008/10000000000000008";

const night: NightCard = {
  id: 12,
  title: "11/12 Game Night — TBD",
  startsAt: "2026-11-13T01:00:00.000Z",
  location: "Sam's place",
  capacity: null,
  cancelled: false,
  kind: "core",
  kindName: null,
  going: [sam, { name: "Riley" }],
  maybe: [alex],
  declined: [],
  others: 0,
  plan: { kind: "vote", lockedIn: null, proposals: [] },
  planUrl: "https://boardroom.example/events/12",
  siteName: "Boardroom",
};

const poll: PollCard = {
  id: 3,
  title: "November heavy",
  location: null,
  status: "open",
  kind: "core",
  kindName: null,
  dates: [
    { id: 20, startsAt: "2026-11-01T01:00:00.000Z", past: true, voters: [] },
    { id: 21, startsAt: "2026-11-06T01:00:00.000Z", past: false, voters: [sam, alex] },
  ],
  pollUrl: null,
  siteName: "Boardroom",
};

type Built = ReturnType<typeof buildNightAnnouncement>;
type Button = { type: number; style?: number; label?: string; url?: string; custom_id?: string };
const buttons = (m: Built) => m.components.filter((c) => c.type === 1).flatMap((c) => (c as { components: Button[] }).components);

describe("buildNightAnnouncement", () => {
  it("shows when, where and how many are coming, without the names", () => {
    const text = componentText(buildNightAnnouncement(night, post).components);
    expect(text).toContain("### 11/12 Game Night — TBD");
    expect(text).toContain("📅 <t:1794531600:F> (<t:1794531600:R>)\n📍 Sam's place\n✅ 2 going · ❔ 1 maybe");
    expect(text).not.toContain("<@10000000000000001>");
  });

  it("has only a link to the post, no buttons to answer", () => {
    expect(buttons(buildNightAnnouncement(night, post))).toEqual([{ type: 2, style: 5, label: "Open the event", url: post }]);
    expect(buttons(buildNightAnnouncement(night, null))).toEqual([]);
  });

  it("says what's being played, proposed or brought", () => {
    const game = { name: "Root", bggId: 237182 };
    const locked = componentText(buildNightAnnouncement({ ...night, plan: { kind: "vote", lockedIn: game, proposals: [] } }, post).components);
    expect(locked).toContain("🎲 Playing [Root](https://boardgamegeek.com/boardgame/237182)");
    const proposals = ["Azul", "Brass", "Cascadia", "Dune"].map((name, i) => ({ name, votes: i }));
    expect(componentText(buildNightAnnouncement({ ...night, plan: { kind: "vote", lockedIn: null, proposals } }, post).components)).toContain(
      "🗳️ Proposed Dune, Cascadia, Brass and 1 more",
    );
    const bring = componentText(buildNightAnnouncement({ ...night, plan: { kind: "bring", games: [{ name: "Azul", bringer: sam }] } }, post).components);
    expect(bring).toContain("🎲 Bringing Azul");
  });

  it("leaves the plan off before anything's proposed", () => {
    expect(componentText(buildNightAnnouncement(night, post).components)).not.toContain("🗳️");
  });

  it("says a night was cancelled, without its answers", () => {
    const text = componentText(buildNightAnnouncement({ ...night, cancelled: true }, post).components);
    expect(text).toContain("~~11/12 Game Night — TBD~~\n🚫 **Cancelled**");
    expect(text).not.toContain("going");
  });

  it("pings above the card when asked", () => {
    const first = buildNightAnnouncement(night, post, nightPing("here"));
    expect(first.components[0]).toEqual({ type: 10, content: "@here" });
  });
});

describe("buildPollAnnouncement", () => {
  it("lists the dates still to come with how many each works for, and links to the post to vote", () => {
    const m = buildPollAnnouncement(poll, post);
    expect(componentText(m.components)).toBe("### November heavy\n-# Picking a date\n📅 <t:1793926800:F> · 2");
    expect(buttons(m)).toEqual([{ type: 2, style: 5, label: "Vote in the post", url: post }]);
  });

  it("says when it's called off", () => {
    const m = buildPollAnnouncement({ ...poll, status: "cancelled" }, post);
    expect(componentText(m.components)).toBe("### ~~November heavy~~\n🚫 **Called off**\n-# Picking a date");
    expect(buttons(m).map((b) => b.label)).toEqual(["Open the poll"]);
  });
});
