import { describe, expect, it } from "vitest";
import { type Comparison, canFinish, fitStrengths, nextPair, questionBudget, replayResult, seededRandom } from "./pairwise";
import { answer, compareIndex, startPlacement } from "./ranking";

const rng = seededRandom;

/** Kendall's tau between an order and the true one (1 = identical, −1 = reversed). */
function kendall(order: number[], truth: number[]) {
  const pos = new Map(truth.map((id, i) => [id, i]));
  let concordant = 0;
  let pairs = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      pairs++;
      if (pos.get(order[i])! < pos.get(order[j])!) concordant++;
    }
  }
  return (2 * concordant) / pairs - 1;
}

/** A replay where `pick` answers each question. */
function replay(ids: number[], pick: (a: number, b: number) => number | null, random: () => number) {
  const comparisons: Comparison[] = [];
  for (let k = 0; k < questionBudget(ids.length); k++) {
    const [a, b] = nextPair(ids, comparisons, random)!;
    comparisons.push({ a, b, winner: pick(a, b) });
  }
  return { comparisons, ...replayResult(ids, comparisons) };
}

describe("fitStrengths", () => {
  it("keeps a game that won every question finite, and below one with more wins", () => {
    const s = fitStrengths([1, 2, 3], [
      { a: 1, b: 2, winner: 1 },
      { a: 1, b: 3, winner: 1 },
      { a: 2, b: 3, winner: 2 },
    ]);
    expect(Number.isFinite(s.get(1)!.theta)).toBe(true);
    expect(s.get(1)!.theta).toBeGreaterThan(s.get(2)!.theta);
    expect(s.get(2)!.theta).toBeGreaterThan(s.get(3)!.theta);
  });

  it("treats 'about the same' as a split", () => {
    const s = fitStrengths([1, 2], [{ a: 1, b: 2, winner: null }]);
    expect(s.get(1)!.theta).toBeCloseTo(s.get(2)!.theta);
  });

  it("is less sure of games it has asked about less", () => {
    const s = fitStrengths([1, 2, 3], [
      { a: 1, b: 2, winner: 1 },
      { a: 1, b: 2, winner: 2 },
      { a: 1, b: 3, winner: 3 },
    ]);
    expect(s.get(1)!.se).toBeLessThan(s.get(3)!.se);
  });

  it("ignores answers about games no longer in the list", () => {
    const s = fitStrengths([1, 2], [{ a: 1, b: 9, winner: 9 }]);
    expect(s.get(1)).toEqual(s.get(2));
  });
});

describe("nextPair", () => {
  it("never asks the same question twice in a row, and reaches every game early", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const random = rng(1);
    const comparisons: Comparison[] = [];
    for (let k = 0; k < ids.length; k++) {
      const [a, b] = nextPair(ids, comparisons, random)!;
      const last = comparisons.at(-1);
      if (last) expect([a, b].sort()).not.toEqual([last.a, last.b].sort());
      comparisons.push({ a, b, winner: Math.max(a, b) });
    }
    const seen = new Set(comparisons.flatMap((c) => [c.a, c.b]));
    expect(seen.size).toBe(ids.length);
  });

  it("has nothing to ask with fewer than two games", () => {
    expect(nextPair([1], [])).toBeNull();
  });
});

describe("questionBudget", () => {
  it("asks every pair once for small lists and about n·log₂n for longer ones", () => {
    expect([1, 2, 3, 5, 7, 20, 40].map(questionBudget)).toEqual([0, 1, 3, 10, 20, 87, 213]);
  });
});

describe("canFinish", () => {
  it("waits until every game has been asked about twice", () => {
    const ids = [1, 2, 3];
    expect(canFinish(ids, [{ a: 1, b: 2, winner: 1 }, { a: 2, b: 3, winner: 2 }])).toBe(false);
    expect(canFinish(ids, [{ a: 1, b: 2, winner: 1 }, { a: 2, b: 3, winner: 2 }, { a: 1, b: 3, winner: 1 }])).toBe(true);
  });
});

describe("replayResult", () => {
  it("recovers the exact order from consistent answers within the budget", () => {
    const ids = [5, 11, 2, 8, 1, 12, 7, 3, 10, 6, 4, 9];
    const truth = [...ids].sort((a, b) => b - a);
    const { order, agreed, decided } = replay(ids, (a, b) => Math.max(a, b), rng(7));
    expect(order).toEqual(truth);
    expect(agreed).toBe(decided);
  });

  it("outvotes a misclick", () => {
    const ids = [1, 2, 3, 4];
    const all: Comparison[] = [];
    for (const a of ids) for (const b of ids) if (a < b) all.push({ a, b, winner: b }, { a, b, winner: b }, { a, b, winner: b });
    all[all.length - 1] = { a: 3, b: 4, winner: 3 }; // one wrong answer about the top two
    const { order, agreed, decided } = replayResult(ids, all);
    expect(order).toEqual([4, 3, 2, 1]);
    expect([agreed, decided]).toEqual([17, 18]);
  });

  it("breaks exact ties with the old list", () => {
    expect(replayResult([1, 2], [{ a: 1, b: 2, winner: null }], [2, 1]).order).toEqual([2, 1]);
  });

  it("gets closer to real preferences than one-shot insertion when answers are noisy", () => {
    // Someone whose answers follow their real preferences, but not perfectly
    const n = 15;
    const truth = Array.from({ length: n }, (_, i) => n - i);
    const trueTheta = (id: number) => id * 0.6;
    let replayTau = 0;
    let insertionTau = 0;
    const runs = 60;
    for (let run = 0; run < runs; run++) {
      const random = rng(100 + run);
      const noisy = (a: number, b: number) => (random() < 1 / (1 + Math.exp(trueTheta(b) - trueTheta(a))) ? a : b);
      const ids = [...truth].sort(() => random() - 0.5);

      replayTau += kendall(replay(ids, noisy, random).order, truth);

      let list: number[] = [];
      for (const id of ids) {
        let p = startPlacement(list.length);
        for (let mid = compareIndex(p); mid !== null; mid = compareIndex(p)) p = answer(p, noisy(id, list[mid]) === id);
        list = [...list.slice(0, p.lo), id, ...list.slice(p.lo)];
      }
      insertionTau += kendall(list, truth);
    }
    expect(replayTau / runs).toBeGreaterThan(insertionTau / runs + 0.05);
    expect(replayTau / runs).toBeGreaterThan(0.75);
  });
});
