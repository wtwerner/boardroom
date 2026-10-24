import { describe, expect, it } from "vitest";
import { type GameFeatures, type Signal, buildProfile, describeReason, featureConsensus, fit, fitSignal, rawPreference, similarity } from "./taste";

const g = (id: number, mechanics: string[], weight: number | null, categories: string[] = []): GameFeatures => ({
  id,
  name: `Game ${id}`,
  weight,
  mechanics,
  categories,
});

const games = new Map(
  [
    g(1, ["Worker Placement", "Hand Management"], 3.5, ["Economic"]),
    g(2, ["Worker Placement"], 3.2, ["Economic"]),
    g(3, ["Deck Building"], 2.4),
    g(4, ["Bluffing", "Voting"], 1.2, ["Party"]),
    g(5, ["Bluffing"], 1.5, ["Party"]),
    g(6, ["Hand Management"], 3.0, ["Economic"]),
  ].map((x) => [x.id, x]),
);

/** Sam loves heavy euros and dislikes party games */
const sam: Signal[] = [
  { userId: "sam", gameId: 1, sentiment: "love", rankPct: 1 },
  { userId: "sam", gameId: 2, sentiment: "love", rankPct: 0.8 },
  { userId: "sam", gameId: 6, sentiment: "like" },
  { userId: "sam", gameId: 3, sentiment: "meh", rankPct: 0.4 },
  { userId: "sam", gameId: 4, sentiment: "nope", rankPct: 0.2 },
  { userId: "sam", gameId: 5, sentiment: "nope" },
];
/** Riley is the opposite */
const riley: Signal[] = [
  { userId: "riley", gameId: 1, sentiment: "nope" },
  { userId: "riley", gameId: 2, sentiment: "meh" },
  { userId: "riley", gameId: 6, sentiment: "meh" },
  { userId: "riley", gameId: 4, sentiment: "love" },
  { userId: "riley", gameId: 5, sentiment: "love" },
  { userId: "riley", gameId: 3, sentiment: "like" },
];

describe("rawPreference", () => {
  it("averages the signals it has", () => {
    expect(rawPreference({ userId: "a", gameId: 1, sentiment: "love", rankPct: 0.5 })).toBe(0.5);
    expect(rawPreference({ userId: "a", gameId: 1, bggRating: 9 })).toBe(1);
    expect(rawPreference({ userId: "a", gameId: 1 })).toBeNull();
  });
});

describe("profiles and fit", () => {
  const samP = buildProfile("sam", sam, games);
  const rileyP = buildProfile("riley", riley, games);
  const newEuro = g(10, ["Worker Placement", "Hand Management"], 3.4, ["Economic"]);
  const newParty = g(11, ["Bluffing", "Voting"], 1.3, ["Party"]);

  it("learns what each member likes", () => {
    expect(samP.affinity.get("mechanic:Worker Placement")!.value).toBeGreaterThan(0);
    expect(samP.affinity.get("mechanic:Bluffing")!.value).toBeLessThan(0);
    expect(samP.weight!.mean).toBeGreaterThan(2.8);
  });

  it("scores new games by those tastes, with reasons", () => {
    const euro = fit(samP, newEuro);
    expect(euro.signal).toBeGreaterThan(0.15);
    expect(euro.reasons.map((r) => describeReason(r, "Sam"))).toContain("Sam likes Worker Placement");
    expect(euro.reasons.map((r) => describeReason(r, null))).toContain("You like Worker Placement");
    expect(fit(samP, newParty).signal).toBeLessThan(-0.15);
    expect(fit(rileyP, newParty).signal).toBeGreaterThan(fit(rileyP, newEuro).signal);
  });

  it("gives the same signal on the fast path the chance model uses", () => {
    const unknownWeight = g(12, ["Deck Building", "Unheard Of"], null);
    for (const p of [samP, rileyP]) for (const game of [newEuro, newParty, unknownWeight, ...games.values()]) expect(fitSignal(p, game)).toBe(fit(p, game).signal);
  });

  it("is neutral about games it knows nothing about", () => {
    expect(fit(samP, g(12, ["Dexterity"], null)).signal).toBe(0);
  });

  it("measures how alike two members' tastes are", () => {
    expect(similarity(samP, rileyP)!.r).toBeLessThan(-0.5);
    expect(similarity(samP, samP)!.r).toBeCloseTo(1);
  });

  it("finds divisive features", () => {
    const bluffing = featureConsensus([samP, rileyP], 2).find((f) => f.label === "Bluffing")!;
    expect(bluffing.min).toBeLessThan(0);
    expect(bluffing.max).toBeGreaterThan(0);
  });
});
