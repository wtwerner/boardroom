import { describe, expect, it } from "vitest";
import { chanceOf, groupChance, knownChance, saidChance, trainChances } from "./chance";
import { seededRandom } from "./pairwise";
import { rankShare } from "./ranking";
import type { GameFeatures, Signal } from "./taste";

const MECHANICS = ["Drafting", "Worker Placement", "Bluffing", "Deck Building", "Trick Taking", "Area Control", "Dice Rolling", "Tile Placement"];

/**
 * A made-up group sharing one list of games. Each member's liking for a game is the
 * sum of their hidden mechanic tastes plus noise; they've ranked `rated[i]` of the
 * first 40 games, and the last 20 are new to everyone.
 */
export function simulateGroup(seed: number, rated: number[]) {
  const random = seededRandom(seed);
  const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const games = Array.from({ length: 60 }, (_, i): GameFeatures => ({
    id: i + 1,
    name: `Game ${i + 1}`,
    weight: null,
    mechanics: [...MECHANICS].sort(() => random() - 0.5).slice(0, 3),
    categories: [],
    bggRating: 6.5 + 1.5 * random(),
  }));
  const members = rated.map((n, m) => {
    const taste = Object.fromEntries(MECHANICS.map((k) => [k, normal()]));
    const utility = new Map(games.map((g) => [g.id, g.mechanics!.reduce((s, k) => s + taste[k], 0) + normal()]));
    const played = games.slice(0, 40).sort(() => random() - 0.5).slice(0, n).sort((a, b) => utility.get(b.id)! - utility.get(a.id)!);
    const signals: Signal[] = played.map((g, i) => ({ userId: `m${m}`, gameId: g.id, rankPct: rankShare(i, played.length) }));
    // "Above their average" for a ranking is above the middle of it: halfway between the two middle games of an even list
    const u = (i: number) => utility.get(played[i].id)!;
    const half = Math.floor(played.length / 2);
    const middle = !played.length ? 0 : played.length % 2 ? u(half) : (u(half - 1) + u(half)) / 2;
    return { id: `m${m}`, signals, utility, middle };
  });
  return { games: new Map(games.map((g) => [g.id, g])), members, unseen: games.slice(40) };
}

/** Each member's chance for each new game, and whether they'd really have liked it. */
export function groupPredictions(seed: number, rated: number[]) {
  const { games, members, unseen } = simulateGroup(seed, rated);
  const signals = members.flatMap((m) => m.signals);
  const models = trainChances(members.map((m) => m.id), signals, games);
  return members.map((m) => unseen.map((g) => ({ p: chanceOf(models.get(m.id)!, g), hit: m.utility.get(g.id)! > m.middle ? 1 : 0 })));
}

const brier = (rs: { p: number; hit: number }[]) => rs.reduce((s, r) => s + (r.p - r.hit) ** 2, 0) / rs.length;

describe("trainChances", () => {
  it("says 50% with nothing to go on", () => {
    const model = trainChances(["m"], [], new Map()).get("m")!;
    const g: GameFeatures = { id: 1, name: "x", weight: null, mechanics: ["Drafting"], categories: [], bggRating: 8 };
    expect(chanceOf(model, g)).toBeCloseTo(0.5);
  });

  it("beats a coin flip, and its percentages line up with what happens, from 6 rankings each up to many", () => {
    for (const rated of [[6, 6, 6, 6], [12, 12, 12, 12], [30, 30, 30, 30], [6, 10, 20, 40]]) {
      const all = Array.from({ length: 60 }, (_, i) => groupPredictions(i + 1, rated)).flat(2);
      expect(brier(all)).toBeLessThan(0.245); // a coin flip scores 0.25
      for (const [lo, hi] of [[0, 0.35], [0.35, 0.65], [0.65, 1]]) {
        const bucket = all.filter((r) => r.p >= lo && r.p < hi);
        if (bucket.length < 100) continue;
        const said = bucket.reduce((s, r) => s + r.p, 0) / bucket.length;
        const happened = bucket.reduce((s, r) => s + r.hit, 0) / bucket.length;
        expect(Math.abs(said - happened), `${rated} rated, ${lo}–${hi}`).toBeLessThan(0.08);
      }
    }
  });

  it("stays nearer 50% for someone with fewer rankings", () => {
    const runs = Array.from({ length: 25 }, (_, i) => groupPredictions(i + 1, [4, 30, 30, 30]));
    const spread = (m: number) => {
      const rs = runs.flatMap((r) => r[m]);
      return rs.reduce((s, r) => s + Math.abs(r.p - 0.5), 0) / rs.length;
    };
    expect(spread(0)).toBeLessThan(spread(1));
  });
});

describe("knownChance", () => {
  it("reads what someone said as above, below or on their average", () => {
    expect([0.3, -0.1, 0].map(knownChance)).toEqual([1, 0, 0.5]);
  });
});

describe("saidChance", () => {
  it("grades what someone said instead of calling it certain", () => {
    expect(saidChance(0)).toBe(0.5);
    expect(saidChance(0.5)).toBeGreaterThan(0.85);
    expect(saidChance(0.5)).toBeLessThan(0.9);
    expect(saidChance(0.1)).toBeLessThan(0.65);
    expect(saidChance(-1.5)).toBeLessThan(0.01);
  });

  it("rises with how far above their average a game sits", () => {
    const chances = [-0.5, -0.1, 0.1, 0.5].map(saidChance);
    expect([...chances].sort((a, b) => a - b)).toEqual(chances);
  });
});

describe("groupChance", () => {
  it("is the average of everyone's chances, so 50% still means no idea", () => {
    expect(groupChance([0.7])).toEqual({ chance: 0.7, of: 1 });
    expect(groupChance([0.5, 0.5, 0.5, 0.5]).chance).toBe(0.5);
    expect(groupChance([1, 0.6, 0.2]).chance).toBeCloseTo(0.6);
    expect(groupChance([])).toEqual({ chance: 0.5, of: 0 });
  });
});
