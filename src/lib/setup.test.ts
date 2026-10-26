import { describe, expect, it } from "vitest";
import { RANKED_TO_START, rankLists, setupProgress, setupSteps } from "./setup";

const fresh = { nameDone: false, needsClaim: false, rateDone: false, rankDone: false, collection: false, bga: false };

describe("setupSteps", () => {
  it("starts with the name, and asks to find yourself in past plays only while it's needed", () => {
    expect(setupSteps(fresh).map((s) => s.key)).toEqual(["name", "rate", "rank", "bgg", "bga"]);
    expect(setupSteps({ ...fresh, needsClaim: true })[1]).toMatchObject({ key: "claim", done: false, optional: false });
  });

  it("marks the integrations optional", () => {
    expect(setupSteps(fresh).filter((s) => s.optional).map((s) => s.key)).toEqual(["bgg", "bga"]);
  });
});

describe("setupProgress", () => {
  it("counts only the steps that matter, and names the next one", () => {
    const p = setupProgress(setupSteps({ ...fresh, nameDone: true, rateDone: true, collection: true }));
    expect(p).toMatchObject({ done: 2, total: 3, complete: false });
    expect(p.next?.key).toBe("rank");
  });

  it("asks for the name first", () => {
    expect(setupProgress(setupSteps(fresh)).next?.key).toBe("name");
  });

  it("is complete without BGG or BGA", () => {
    expect(setupProgress(setupSteps({ ...fresh, nameDone: true, rateDone: true, rankDone: true }))).toMatchObject({ complete: true, next: null });
  });
});

describe("rankLists", () => {
  const games = (tier: "heavy" | "light", from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i, tier }));

  it("keeps each list apart, so a full heavy list doesn't cover the light games", () => {
    const played = [...games("heavy", 1, 11), ...games("light", 100, 39)];
    const lists = rankLists(played, new Set(games("heavy", 1, 11).map((g) => g.id)));
    expect(lists).toEqual([
      { tier: "heavy", played: 11, ranked: 11, done: true },
      { tier: "light", played: 39, ranked: 0, done: false },
    ]);
  });

  it("is done with a solid start in a long list, or all of a short one", () => {
    const long = games("light", 100, 30);
    expect(rankLists(long, new Set(long.slice(0, RANKED_TO_START).map((g) => g.id)))[0].done).toBe(true);
    expect(rankLists(long, new Set(long.slice(0, RANKED_TO_START - 1).map((g) => g.id)))[0].done).toBe(false);
    const short = games("heavy", 1, 3);
    expect(rankLists(short, new Set([1, 2, 3]))[0].done).toBe(true);
  });

  it("leaves out a list with nothing played in it", () => {
    expect(rankLists(games("heavy", 1, 2), new Set()).map((l) => l.tier)).toEqual(["heavy"]);
  });
});
