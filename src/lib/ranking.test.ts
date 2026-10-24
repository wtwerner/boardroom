import { describe, expect, it } from "vitest";
import { answer, compareIndex, groupRanking, rankShare, startPlacement } from "./ranking";

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
