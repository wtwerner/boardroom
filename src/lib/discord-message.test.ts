import { describe, expect, it } from "vitest";
import { COMPONENTS_V2, buildPlayMessage, componentText } from "./discord-message";
import { parsePlayMessage } from "./play-parser";

const game = {
  gameName: "Dune: Imperium – Uprising",
  bggId: 397598,
  imageUrl: "https://cf.geekdo-images.com/box.jpg",
  playNumber: 1,
  appUrl: "https://boardroom.example/games/397598",
};
const play = {
  games: [game],
  playedOn: "2026-10-18",
  location: "Alex's",
  notes: "Close one *again*",
  players: [{ name: "Sam", discordId: "111" }, { name: "Riley" }],
  loggedBy: "Sam",
};

describe("buildPlayMessage", () => {
  const msg = buildPlayMessage(play);

  it("is a Components V2 card with box art and link buttons", () => {
    expect(msg.flags).toBe(COMPONENTS_V2);
    const [card, row] = msg.components as { type: number; accent_color?: number; components: { type: number; accessory?: unknown; url?: string }[] }[];
    expect(card.type).toBe(17);
    expect(card.accent_color).toBe(0xc9960f); // first play gets the gold accent
    expect(card.components[0]).toMatchObject({ type: 9, accessory: { type: 11, media: { url: game.imageUrl } } });
    expect(row.components.map((b) => b.url)).toEqual(["https://boardgamegeek.com/boardgame/397598", game.appUrl]);
    expect(componentText(msg.components)).toContain("-# 🎉 First time playing it together, logged by Sam");
  });

  it("reads back through the play-log parser", () => {
    const [parsed] = parsePlayMessage({
      content: componentText(msg.components),
      timestamp: "2026-10-19T02:00:00Z",
      timeZone: "America/New_York",
      // Discord may not list mentions; the id still comes through
      mentions: [],
    })!;
    expect(parsed).toEqual({
      gameName: "Dune: Imperium – Uprising",
      bggId: 397598,
      playedOn: "2026-10-18",
      location: "Alex's",
      notes: "Close one *again*",
      players: [
        { name: "Discord user 111", discordId: "111" },
        { name: "Riley", discordId: undefined },
      ],
    });
  });

  it("reads back the same with the bot's own emoji", () => {
    const emoji = { playing: "10000000000000020", date: "10000000000000021", place: "10000000000000022", players: "10000000000000023", notes: "10000000000000024", first: "10000000000000025" };
    const withEmoji = buildPlayMessage({ ...play, emoji });
    const text = componentText(withEmoji.components);
    expect(text).toContain("### <:playing:10000000000000020> [Dune: Imperium – Uprising]");
    expect(text).toContain("<:players:10000000000000023> <@111>, Riley");
    const read = (m: typeof msg) => parsePlayMessage({ content: componentText(m.components), timestamp: "2026-10-19T02:00:00Z", timeZone: "America/New_York", mentions: [] });
    expect(read(withEmoji)).toEqual(read(msg));
  });
});

describe("buildPlayMessage for a night of several games", () => {
  const msg = buildPlayMessage({
    ...play,
    games: [
      { ...game, playNumber: 4 },
      { gameName: "The White Castle", bggId: 371942, imageUrl: "https://cf.geekdo-images.com/castle.jpg", playNumber: 1, appUrl: "https://boardroom.example/games/371942" },
    ],
  });
  const [card, row] = msg.components as { components: { type: number; items?: unknown[]; label?: string }[]; accent_color?: number }[];

  it("shows every box and a button per game", () => {
    expect(card.components.find((c) => c.type === 12)?.items).toHaveLength(2);
    expect(row.components.map((b) => b.label)).toEqual(["Dune: Imperium – Uprising", "The White Castle"]);
    expect(card.accent_color).toBe(0xc9960f);
    expect(componentText(msg.components)).toContain("-# 🎉 First time playing The White Castle together, logged by Sam");
  });

  it("reads back as one play per game, in order", () => {
    const parsed = parsePlayMessage({ content: componentText(msg.components), timestamp: "2026-10-19T02:00:00Z", timeZone: "America/New_York" })!;
    expect(parsed.map((p) => [p.gameName, p.bggId, p.playedOn])).toEqual([
      ["Dune: Imperium – Uprising", 397598, "2026-10-18"],
      ["The White Castle", 371942, "2026-10-18"],
    ]);
  });
});

describe("buildPlayMessage for a long night", () => {
  const games = Array.from({ length: 7 }, (_, i) => ({ gameName: `Game ${i + 1}`, bggId: 1000 + i, playNumber: 2, appUrl: `https://boardroom.example/games/${1000 + i}` }));
  const msg = buildPlayMessage({ ...play, games, threadId: "10000000000000030" });
  const rows = msg.components.slice(1) as { type: number; components: { label: string }[] }[];

  it("links every game, five to a row", () => {
    expect(rows.map((r) => r.components.length)).toEqual([5, 2]);
    expect(rows.flatMap((r) => r.components.map((b) => b.label))).toEqual(games.map((g) => g.gameName));
  });

  it("links the night's thread, and still reads back", () => {
    const text = componentText(msg.components);
    expect(text).toContain("-# logged by Sam · <#10000000000000030>");
    const parsed = parsePlayMessage({ content: text, timestamp: "2026-10-19T02:00:00Z", timeZone: "America/New_York" })!;
    expect(parsed.map((p) => p.gameName)).toEqual(games.map((g) => g.gameName));
  });
});
