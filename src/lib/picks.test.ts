import { describe, expect, it } from "vitest";
import { MIN_PICK_CHANCE, askFor, choosePicks, isFromLatestAsk } from "./picks";

describe("choosePicks", () => {
  it("keeps the most likely hits, best first", () => {
    const picks = choosePicks(
      [
        { name: "A", chance: 0.7 },
        { name: "B", chance: 0.95 },
        { name: "C", chance: 0.8 },
      ],
      2,
    );
    expect(picks.map((p) => p.name)).toEqual(["B", "C"]);
  });

  it("leaves out coin flips even when that means fewer picks", () => {
    const picks = choosePicks(
      [
        { name: "A", chance: MIN_PICK_CHANCE - 0.01 },
        { name: "B", chance: MIN_PICK_CHANCE },
      ],
      8,
    );
    expect(picks.map((p) => p.name)).toEqual(["B"]);
  });

  it("puts games the model can't score after scored ones, in Claude's order", () => {
    const picks = choosePicks(
      [
        { name: "A", chance: null },
        { name: "B", chance: 0.65 },
        { name: "C", chance: null },
      ],
      3,
    );
    expect(picks.map((p) => p.name)).toEqual(["B", "A", "C"]);
  });
});

describe("askFor", () => {
  it("asks Claude for more than the list shows", () => {
    expect(askFor("group")).toBe(12);
    expect(askFor("me")).toBe(9);
  });
});

describe("isFromLatestAsk", () => {
  const latest = new Date("2026-10-20T12:00:00Z");

  it("counts picks stamped with the latest ask, or inserted during it", () => {
    expect(isFromLatestAsk(latest, latest)).toBe(true);
    expect(isFromLatestAsk(new Date("2026-10-20T11:59:10Z"), latest)).toBe(true);
  });

  it("leaves out picks from an earlier ask", () => {
    expect(isFromLatestAsk(new Date("2026-10-19T12:00:00Z"), latest)).toBe(false);
    expect(isFromLatestAsk(latest, null)).toBe(false);
  });
});
