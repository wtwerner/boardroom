import { describe, expect, it } from "vitest";
import { formatPlayMessage, parseDate, parsePlayMessage } from "./play-parser";

const ts = "2026-10-17T02:30:00.000Z"; // Fri Oct 16, 10:30pm in New York
const tz = "America/New_York";

describe("parsePlayMessage", () => {
  it("parses the group's emoji template", () => {
    const plays = parsePlayMessage({
      timestamp: "2026-10-19T03:10:00.000Z",
      timeZone: tz,
      mentions: [
        { id: "100000000000000001", username: "sam", global_name: "Sam" },
        { id: "100000000000000002", username: "alexb", global_name: "Alex" },
        { id: "100000000000000003", username: "jordan", global_name: null },
        { id: "100000000000000004", username: "casey", global_name: "Casey" },
      ],
      content: [
        "📅 **10/18/26**",
        "📍 Alex’s",
        "🤼 <@100000000000000001> <@100000000000000002> <@100000000000000003> <@100000000000000004> ",
        "🎲: [Dune Imperium Uprising](https://boardgamegeek.com/boardgame/397598/dune-imperium-uprising)",
      ].join("\n"),
    });
    expect(plays).toEqual([
      {
        gameName: "Dune Imperium Uprising",
        bggId: 397598,
        playedOn: "2026-10-18",
        location: "Alex’s",
        notes: undefined,
        players: [
          { name: "Sam", discordId: "100000000000000001" },
          { name: "Alex", discordId: "100000000000000002" },
          { name: "jordan", discordId: "100000000000000003" },
          { name: "Casey", discordId: "100000000000000004" },
        ],
      },
    ]);
  });


  it("parses a simple key/value template", () => {
    const plays = parsePlayMessage({
      timestamp: ts,
      timeZone: tz,
      content: [
        "**Game:** Cascadia",
        "**Players:** Sam, Alex & Jordan",
        "**Winner:** Alex",
        "**Location:** Sam's place",
      ].join("\n"),
    });
    expect(plays).toEqual([
      {
        gameName: "Cascadia",
        playedOn: "2026-10-16",
        location: "Sam's place",
        notes: undefined,
        players: [
          { name: "Sam", discordId: undefined },
          { name: "Alex", discordId: undefined },
          { name: "Jordan", discordId: undefined },
        ],
      },
    ]);
  });

  it("resolves Discord mentions and ignores winners and scores", () => {
    const [play] = parsePlayMessage({
      timestamp: ts,
      timeZone: tz,
      mentions: [{ id: "111", username: "samthegreat", global_name: "Sam" }],
      content: "Game: Wingspan\nScores: <@111> 87, Alex (92)\nWinner: Alex",
    })!;
    expect(play.players).toEqual([
      { name: "Sam", discordId: "111" },
      { name: "Alex", discordId: undefined },
    ]);
  });

  it("splits a multi-game night into one play per game", () => {
    const plays = parsePlayMessage({
      timestamp: ts,
      content: "Date: 10/3\nGames: Raiders and Traders, Azul; The Crew\nPlayers: Sam and Alex\nWinner: Sam",
    })!;
    expect(plays.map((p) => p.gameName)).toEqual(["Raiders and Traders", "Azul", "The Crew"]);
    expect(plays.every((p) => p.playedOn === "2026-10-03")).toBe(true);
    expect(plays[0].players).toEqual([
      { name: "Sam", discordId: undefined },
      { name: "Alex", discordId: undefined },
    ]);
  });

  it("splits linked games joined with + in the emoji template", () => {
    const plays = parsePlayMessage({
      timestamp: "2026-06-01T04:36:00.000Z",
      timeZone: tz,
      mentions: [
        { id: "100000000000000001", username: "sam", global_name: "Sam" },
        { id: "100000000000000002", username: "alexb", global_name: "Alex" },
      ],
      content: [
        "📅 **5/31/26**",
        "📍 Sam’s",
        "🤼 <@100000000000000001> <@100000000000000002>",
        "🎲: [Endeavor: Deep Sea](https://boardgamegeek.com/boardgame/367150/endeavor-deep-sea) + [The White Castle](https://boardgamegeek.com/boardgame/371942/the-white-castle)",
      ].join("\n"),
    })!;
    expect(plays.map((p) => [p.gameName, p.bggId])).toEqual([
      ["Endeavor: Deep Sea", 367150],
      ["The White Castle", 371942],
    ]);
    expect(plays.every((p) => p.playedOn === "2026-05-31" && p.location === "Sam’s" && p.players.length === 2)).toBe(true);
  });

  it("treats every BGG link on a game line as its own game, whatever joins them", () => {
    const games = (line: string) => parsePlayMessage({ timestamp: ts, content: `🎲 ${line}` })!.map((p) => p.gameName);
    expect(games("[Azul](https://boardgamegeek.com/boardgame/230802) & [Skull](https://boardgamegeek.com/boardgame/92415)")).toEqual(["Azul", "Skull"]);
    expect(games("[Azul](https://boardgamegeek.com/boardgame/230802) [Skull](https://boardgamegeek.com/boardgame/92415)")).toEqual(["Azul", "Skull"]);
    expect(games("Cascadia + Heat")).toEqual(["Cascadia", "Heat"]);
    // Titles that contain "&" stay whole when they aren't separate links
    expect(games("Lewis & Clark")).toEqual(["Lewis & Clark"]);
  });

  it("reads a 🎲: line with the games listed under it, the casual night's way", () => {
    const plays = parsePlayMessage({
      timestamp: "2026-07-20T15:00:00.000Z",
      timeZone: tz,
      mentions: [
        { id: "100000000000000001", username: "sam", global_name: "Sam" },
        { id: "100000000000000002", username: "alexb", global_name: "Alex" },
      ],
      content: [
        "📅 **7/19/26**",
        "📍 Belmont Tavern",
        "🤼 <@100000000000000001> <@100000000000000002> +Chad + his fam",
        "🧵 https://discord.com/channels/1/2",
        "🎲:",
        "- [Love Letter](https://boardgamegeek.com/boardgame/129622/love-letter)",
        "- Century: Spice Road",
        "- ??",
      ].join("\n"),
    })!;
    expect(plays.map((p) => [p.gameName, p.bggId])).toEqual([
      ["Love Letter", 129622],
      ["Century: Spice Road", undefined],
    ]);
    expect(plays[0].playedOn).toBe("2026-07-19");
    expect(plays[0].players).toEqual([
      { name: "Sam", discordId: "100000000000000001" },
      { name: "Alex", discordId: "100000000000000002" },
      { name: "Chad", discordId: undefined },
    ]);
  });

  it("returns null for chatter", () => {
    expect(parsePlayMessage({ timestamp: ts, content: "anyone up for games friday?" })).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-09-30", "2026-09-30"],
    ["10/12/2025", "2025-10-12"],
    ["10/12/25", "2025-10-12"],
    ["Oct 12", "2026-10-12"],
    ["October 1st, 2024", "2024-10-01"],
    ["12 Sept", "2026-09-12"],
    ["Dec 28", "2025-12-28"], // later in the year than the post → last year
    ["yesterday", "2026-10-15"],
    ["last Tuesday", "2026-10-13"],
    ["Friday", "2026-10-16"],
  ])("%s → %s", (raw, expected) => {
    expect(parseDate(raw, ts, tz)).toBe(expected);
  });
});

describe("formatPlayMessage", () => {
  it("round-trips through the parser", () => {
    const play = {
      games: [{ gameName: "Heat: Pedal to the Metal", bggId: 366013 }],
      playedOn: "2026-10-16",
      location: "Sam's",
      notes: "Rainy track",
      players: [{ name: "Sam", discordId: "111" }, { name: "Riley" }],
    };
    const content = formatPlayMessage(play);
    expect(content).toBe(
      ["📅 **10/16/26**", "📍 Sam's", "🤼 <@111>, Riley", "🎲: [Heat: Pedal to the Metal](https://boardgamegeek.com/boardgame/366013)", "📝 Rainy track"].join("\n"),
    );
    const [parsed] = parsePlayMessage({
      content,
      timestamp: ts,
      timeZone: tz,
      mentions: [{ id: "111", username: "sam", global_name: "Sam" }],
    })!;
    expect(parsed).toEqual({
      gameName: "Heat: Pedal to the Metal",
      bggId: 366013,
      playedOn: "2026-10-16",
      location: "Sam's",
      notes: "Rainy track",
      players: [
        { name: "Sam", discordId: "111" },
        { name: "Riley", discordId: undefined },
      ],
    });
  });
});

describe("formatPlayMessage with several games", () => {
  it("joins them on one 🎲 line that parses back into one play each, in order", () => {
    const content = formatPlayMessage({
      games: [
        { gameName: "Endeavor: Deep Sea", bggId: 367150 },
        { gameName: "The White Castle", bggId: 371942 },
        { gameName: "Skull" },
      ],
      playedOn: "2026-05-31",
      players: [{ name: "Sam" }],
    });
    expect(content).toContain(
      "🎲: [Endeavor: Deep Sea](https://boardgamegeek.com/boardgame/367150) + [The White Castle](https://boardgamegeek.com/boardgame/371942) + Skull",
    );
    const plays = parsePlayMessage({ content, timestamp: "2026-06-01T03:00:00Z", timeZone: tz })!;
    expect(plays.map((p) => [p.gameName, p.bggId])).toEqual([
      ["Endeavor: Deep Sea", 367150],
      ["The White Castle", 371942],
      ["Skull", undefined],
    ]);
  });
});
