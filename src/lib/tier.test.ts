import { describe, expect, it } from "vitest";
import { gameTier, replaceTier } from "./tier";

describe("gameTier", () => {
  it("goes by weight unless set by hand", () => {
    expect(gameTier({ weight: 3.36, tier: null })).toBe("heavy"); // Barcelona
    expect(gameTier({ weight: 2.78, tier: null })).toBe("heavy"); // Last Light
    expect(gameTier({ weight: 2.5, tier: null })).toBe("light"); // Clank! Catacombs
    expect(gameTier({ weight: 1.94, tier: "heavy" })).toBe("heavy"); // Quacks, moved up
    expect(gameTier({ weight: 3.0, tier: "light" })).toBe("light");
    expect(gameTier({ weight: null, tier: null })).toBe("light");
  });
});

describe("replaceTier", () => {
  const heavy = new Set([1, 3, 5, 7]);
  const inTier = (id: number) => heavy.has(id);

  it("reorders one tier in its own spots and leaves the other alone", () => {
    expect(replaceTier([1, 2, 3, 4, 5], inTier, [5, 1, 3])).toEqual([5, 2, 1, 4, 3]);
  });

  it("adds newly placed games after everything else", () => {
    expect(replaceTier([1, 2, 3], inTier, [3, 7, 1])).toEqual([3, 2, 7, 1]);
  });

  it("drops games taken out of the list", () => {
    expect(replaceTier([1, 2, 3, 4], inTier, [3])).toEqual([3, 2, 4]);
  });

  it("starts a tier from nothing", () => {
    expect(replaceTier([2, 4], inTier, [5, 1])).toEqual([2, 4, 5, 1]);
  });
});
