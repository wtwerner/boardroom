import { describe, expect, it } from "vitest";
import { answer, clearPick, compareIndex, crowdLists, crowdSince, groupRanking, rankShare, settleClearCalls, startPlacement } from "./ranking";

describe("groupRanking", () => {
  it("scores by the share of each list a game beats, so long and short lists count the same", () => {
    // a: 1 is top of 4; b: 1 is top of 2
    const result = groupRanking({ a: [1, 2, 3, 4], b: [1, 3] });
    expect(result[0]).toMatchObject({ gameId: 1, points: 83, positions: { a: 0, b: 0 } }); // (1 + 1 + .5) / 3
    // 2: (⅔ + .5) / 2; 3: (⅓ + 0 + .5) / 3; 4: (0 + .5) / 2
    expect(result.map((r) => [r.gameId, r.points])).toEqual([[1, 83], [2, 58], [3, 28], [4, 25]]);
  });

  it("puts the middle of a list at 50 and treats the top and bottom alike", () => {
    expect([0, 1, 2].map((i) => rankShare(i, 3))).toEqual([1, 0.5, 0]);
    expect(rankShare(0, 1)).toBe(0.5);
    // the bottom of a short list and of a long one count the same
    const result = groupRanking({ a: [1, 2], b: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
    expect(result.find((r) => r.gameId === 2)!.points).toBe(result.find((r) => r.gameId === 12)!.points);
  });

  it("doesn't let one person's #1 beat a game everyone ranks highly", () => {
    const result = groupRanking({
      a: [9, 1, 2, 3, 4],
      b: [1, 2, 3, 4, 5],
      c: [1, 2, 3, 4, 5],
    });
    expect(result[0].gameId).toBe(1);
  });
});

describe("placement", () => {
  /** Places `value` into a sorted (best-first, descending) list by answering honestly. */
  const place = (list: number[], value: number) => {
    let p = startPlacement(list.length);
    for (let mid = compareIndex(p); mid !== null; mid = compareIndex(p)) {
      p = answer(p, value === list[mid] ? "same" : value > list[mid]);
    }
    return [...list.slice(0, p.lo), value, ...list.slice(p.lo)];
  };

  it("finds the right spot with a handful of questions", () => {
    const list = [90, 80, 70, 60, 50, 40, 30, 20, 10];
    expect(place(list, 95)).toEqual([95, ...list]);
    expect(place(list, 5)).toEqual([...list, 5]);
    expect(place(list, 55)).toEqual([90, 80, 70, 60, 55, 50, 40, 30, 20, 10]);
    expect(place([], 1)).toEqual([1]);
  });

  it("puts a tie right after the game it matched", () => {
    expect(place([90, 70, 50], 70)).toEqual([90, 70, 70, 50]);
  });
});

describe("a night's crowd", () => {
  it("counts back a year from today", () => {
    expect(crowdSince("2026-11-10")).toBe("2025-11-10");
    expect(crowdSince("2024-03-01", 1)).toBe("2024-02-29");
  });

  it("keeps only the lists of the people who come", () => {
    const lists = { "u-sam": [1, 2], "u-alex": [2, 1], "u-casey": [3] };
    expect(crowdLists(lists, new Set(["u-sam", "u-casey"]))).toEqual({ "u-sam": [1, 2], "u-casey": [3] });
    expect(groupRanking(crowdLists(lists, new Set(["u-alex"])))[0].gameId).toBe(2);
  });
});

describe("settleClearCalls", () => {
  const ratings: Record<number, number> = { 1: 9, 2: 8.5, 3: 6, 4: 4, 5: 9.5 };
  const rating = (id: number) => ratings[id];

  it("only settles questions with BGG ratings 2 or more apart", () => {
    expect(clearPick(9, 6)).toBe(true);
    expect(clearPick(6, 8)).toBe(false);
    expect(clearPick(9, 8.5)).toBeNull();
    expect(clearPick(9, null)).toBeNull();
  });

  it("places games the ratings settle and stops at the first close call", () => {
    // 1 and 3 start the list; 4 is below both; 2 is close to 1, so that's asked
    const s = settleClearCalls({ ids: [], queue: [3, 1, 4, 2], placement: startPlacement(0) }, rating);
    expect(s.ids).toEqual([1, 3, 4]);
    expect(s.queue).toEqual([2]);
    // 2 beat 3 without asking (the middle of the list), and now it's 2 against 1
    expect(compareIndex(s.placement)).toBe(0);
    expect(s.answered).toBe(3);
  });

  it("asks about a game with no BGG rating", () => {
    const s = settleClearCalls({ ids: [1, 4], queue: [99, 5], placement: startPlacement(2) }, rating);
    expect(s).toEqual({ ids: [1, 4], queue: [99, 5], placement: startPlacement(2), answered: 0 });
  });
});
