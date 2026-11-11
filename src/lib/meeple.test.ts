import { describe, expect, it } from "vitest";
import { MEEPLE_COLORS } from "@/db/enums";
import { pickColor, topFew } from "./meeple";

describe("pickColor", () => {
  it("picks among the colors nobody has", () => {
    const used = MEEPLE_COLORS.filter((c) => c !== "teal" && c !== "pink");
    expect(pickColor(used, () => 0)).toBe("pink");
    expect(pickColor(used, () => 0.99)).toBe("teal");
  });

  it("starts repeating once every color is used, with the least used", () => {
    const used = [...MEEPLE_COLORS, ...MEEPLE_COLORS.filter((c) => c !== "brown")];
    expect(pickColor(used, () => 0.5)).toBe("brown");
  });

  it("ignores players without a color", () => {
    expect(pickColor([null, null], () => 0)).toBe(MEEPLE_COLORS[0]);
  });
});

describe("topFew", () => {
  const people = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, chance: n / 10 }));

  it("keeps everyone, in their order, while they fit", () => {
    expect(topFew(people.slice(0, 6), (p) => p.chance)).toEqual({ shown: people.slice(0, 6), rest: [] });
  });

  it("shows the best and counts the rest past that", () => {
    const { shown, rest } = topFew(people, (p) => p.chance);
    expect(shown.map((p) => p.id)).toEqual([8, 7, 6, 5, 4]);
    expect(rest.map((p) => p.id)).toEqual([3, 2, 1]);
  });
});
