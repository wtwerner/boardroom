import { describe, expect, it } from "vitest";
import { type NightGame, type NightInput, scoreNight } from "./night";

const game = (over: Partial<NightGame> & Pick<NightGame, "id" | "name">): NightGame => ({
  minPlayers: 2,
  maxPlayers: 4,
  bestPlayers: [],
  minPlaytime: 30,
  maxPlaytime: 60,
  weight: 2.5,
  ownerIds: ["a"],
  lastPlayedOn: "2026-01-01",
  playCount: 3,
  playedBy: ["a", "b"],
  ...over,
});

const base: NightInput = {
  games: [],
  opinions: [],
  rankings: [],
  presentUserIds: ["a", "b"],
  names: { a: "Sam", b: "Alex", c: "Jordan" },
  playerCount: 4,
  minutes: 90,
  ownedByPresentOnly: true,
  today: "2026-10-16",
};

describe("scoreNight", () => {
  it("filters by player count, time, and who owns it", () => {
    const result = scoreNight({
      ...base,
      games: [
        game({ id: 1, name: "Fits" }),
        game({ id: 2, name: "Too few seats", maxPlayers: 3 }),
        game({ id: 3, name: "Too long", minPlaytime: 180 }),
        game({ id: 4, name: "Owner not coming", ownerIds: ["c"] }),
        game({ id: 5, name: "Too light", weight: 1.4 }),
      ],
      minWeight: 2,
    });
    expect(result.map((r) => r.game.name)).toEqual(["Fits"]);
  });

  it("drops games heavier than the cap", () => {
    const result = scoreNight({ ...base, games: [game({ id: 1, name: "Light", weight: 1.8 }), game({ id: 2, name: "Heavy", weight: 3.6 })], maxWeight: 2.5 });
    expect(result.map((r) => r.game.name)).toEqual(["Light"]);
  });

  it("speaks of the casual night, and favors the games it keeps coming back to", () => {
    const games = [
      game({ id: 1, name: "Staple", playCount: 4, lastPlayedOn: "2026-08-16" }),
      game({ id: 2, name: "Once", playCount: 1, lastPlayedOn: "2026-08-16" }),
      game({ id: 3, name: "New to it", playCount: 0, lastPlayedOn: null }),
    ];
    const casual = scoreNight({ ...base, games, night: "casual" });
    expect(casual.map((r) => [r.game.name, r.score])).toEqual([
      ["New to it", 1],
      ["Staple", 1],
      ["Once", 0],
    ]);
    expect(casual.find((r) => r.game.id === 3)!.reasons.map((r) => r.text)).toEqual(["Never played at casual night"]);
    // The core group's nights don't reward replays
    expect(scoreNight({ ...base, games }).find((r) => r.game.id === 1)!.score).toBe(0);
  });

  it("lets taste stand in for people who haven't rated a game, so an unplayed one can compete", () => {
    const games = [
      game({ id: 1, name: "Old favorite", lastPlayedOn: "2026-08-16" }),
      game({ id: 2, name: "Unplayed", playCount: 0, lastPlayedOn: null, playedBy: [] }),
    ];
    const opinions = [{ userId: "a", gameId: 1, sentiment: "love" as const, wantToPlay: false, mustPlay: false }];
    // Without a guess Sam's love wins; with Sam and Alex likely to enjoy the new one, it leads
    expect(scoreNight({ ...base, games, opinions })[0].game.name).toBe("Old favorite");
    const result = scoreNight({ ...base, games, opinions, chances: { 2: { a: 0.8, b: 0.7, c: 0.1 } } });
    expect(result.map((r) => [r.game.name, r.score])).toEqual([
      ["Unplayed", 4],
      ["Old favorite", 3],
    ]);
    // Jordan isn't coming, so their guess doesn't count
    expect(result[0].reasons.map((r) => r.text)).toEqual(["Suits Sam & Alex's taste", "Never played together"]);
    expect(scoreNight({ ...base, games, chances: { 2: { a: 0.2 } } }).find((r) => r.game.id === 2)!.reasons[0]).toEqual({ text: "Not Sam's usual thing", tone: "bad" });
  });

  it("gives a game nobody coming has played more of a lift on the core group's nights, and can show only those", () => {
    const games = [
      game({ id: 1, name: "Played at casual night", playCount: 0, lastPlayedOn: null, playedBy: ["a"] }),
      game({ id: 2, name: "New to us", playCount: 0, lastPlayedOn: null, playedBy: ["c"] }),
    ];
    expect(scoreNight({ ...base, games }).map((r) => [r.game.name, r.score])).toEqual([
      ["New to us", 2],
      ["Played at casual night", 1],
    ]);
    // At casual night someone coming has to teach it
    const casual = scoreNight({ ...base, games, night: "casual" });
    expect(casual.map((r) => [r.game.name, r.score])).toEqual([
      ["Played at casual night", 1],
      ["New to us", -0.5],
    ]);
    expect(casual[1].reasons).toContainEqual({ text: "Nobody coming has played it", tone: "bad" });
    expect(scoreNight({ ...base, games, newOnly: true }).map((r) => r.game.name)).toEqual(["New to us"]);
  });

  it("ranks each game only against its own tier", () => {
    const result = scoreNight({
      ...base,
      games: [1, 2, 3, 4].map((id) => game({ id, name: `Game ${id}`, lastPlayedOn: "2026-08-16" })),
      // Sam's heavy list, then light list: each one's top game is a top game
      rankings: [{ a: [1, 2] }, { a: [3, 4] }],
    });
    const score = Object.fromEntries(result.map((r) => [r.game.id, r.score]));
    expect(score[1]).toBe(score[3]);
    expect(score[2]).toBe(score[4]);
    expect(score[1]).toBeGreaterThan(score[2]);
  });

  it("counts only the rankings of people who are coming, centered on the middle of their lists", () => {
    const result = scoreNight({
      ...base,
      // Played two months ago, so how recently doesn't move the score
      games: [1, 2, 3].map((id) => game({ id, name: ["Sam's top", "Sam's middle", "Sam's bottom"][id - 1], lastPlayedOn: "2026-08-16" })),
      rankings: [{ a: [1, 2, 3], c: [3, 2, 1] }], // Jordan (c) isn't coming
    });
    expect(result.map((r) => [r.game.name, r.score])).toEqual([
      ["Sam's top", 1.5], // 75 points: (1 + ½) / 2
      ["Sam's middle", 0],
      ["Sam's bottom", -1.5],
    ]);
    expect(result[0].reasons.map((r) => r.text)).toContain("High in your rankings");
  });

  it("ranks by the opinions of people who are coming", () => {
    const result = scoreNight({
      ...base,
      games: [game({ id: 1, name: "Loved" }), game({ id: 2, name: "Disliked" })],
      opinions: [
        { userId: "a", gameId: 1, sentiment: "love", wantToPlay: true, mustPlay: false },
        { userId: "b", gameId: 2, sentiment: "nope", wantToPlay: false, mustPlay: false },
        // Jordan isn't coming, so this shouldn't help game 2
        { userId: "c", gameId: 2, sentiment: "love", wantToPlay: true, mustPlay: true },
      ],
    });
    expect(result.map((r) => r.game.name)).toEqual(["Loved", "Disliked"]);
    expect(result[0].reasons.map((r) => r.text)).toContain("Sam loves it");
    expect(result[1].reasons.map((r) => r.text)).toContain("Alex would rather not");
  });

  it("says who wants to play a game, whether they've played it with the group or not", () => {
    const result = scoreNight({
      ...base,
      games: [game({ id: 1, name: "Sam's played it", playedBy: ["a"] })],
      opinions: [
        { userId: "a", gameId: 1, sentiment: null, wantToPlay: true, mustPlay: false },
        { userId: "b", gameId: 1, sentiment: null, wantToPlay: true, mustPlay: false },
      ],
    });
    expect(result[0].reasons.map((r) => r.text)).toContain("Sam & Alex want to play it");
  });

  it("lets one person's must-play vote outweigh a single keen vote", () => {
    const result = scoreNight({
      ...base,
      games: [game({ id: 1, name: "Keen" }), game({ id: 2, name: "Must" })],
      opinions: [
        { userId: "a", gameId: 1, sentiment: "like", wantToPlay: true, mustPlay: false },
        { userId: "b", gameId: 2, sentiment: null, wantToPlay: false, mustPlay: true },
      ],
    });
    expect(result.map((r) => r.game.name)).toEqual(["Must", "Keen"]);
    expect(result[0].reasons.map((r) => r.text)).toContain("🔥 Alex really wants to play it");
  });

  it("penalises games played in the last two weeks", () => {
    const result = scoreNight({
      ...base,
      games: [game({ id: 1, name: "Recent", lastPlayedOn: "2026-10-12" }), game({ id: 2, name: "Older" })],
    });
    expect(result.map((r) => r.game.name)).toEqual(["Older", "Recent"]);
    expect(result[1].reasons[0].text).toBe("Played 4 days ago");
  });
});
