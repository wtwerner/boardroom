import { describe, expect, it } from "vitest";
import { fillTitle, retitle, titleGame } from "./night-title";

const core = "{date} Game Night — {game}";
const casual = "{date} Casual Night";

describe("fillTitle", () => {
  it("puts in the date as month and day, and TBD before a game is locked in", () => {
    expect(fillTitle(core, "2026-10-29")).toBe("10/29 Game Night — TBD");
    expect(fillTitle(core, "2026-11-05", "Brass: Birmingham")).toBe("11/5 Game Night — Brass: Birmingham");
    expect(fillTitle(casual, "2026-10-29", "Brass: Birmingham")).toBe("10/29 Casual Night");
  });

  it("keeps to 100 characters", () => {
    expect(fillTitle(core, "2026-10-29", "x".repeat(120))).toHaveLength(100);
  });
});

describe("titleGame", () => {
  it("reads the game out of a title the template made", () => {
    expect(titleGame("10/29 Game Night — TBD", core, "2026-10-29")).toBe("TBD");
    expect(titleGame("10/29 Game Night — Root", core, "2026-10-29")).toBe("Root");
  });

  it("is null for a title named by hand, or made for another date", () => {
    expect(titleGame("Thursday heavy", core, "2026-10-29")).toBeNull();
    expect(titleGame("10/30 Game Night — Root", core, "2026-10-29")).toBeNull();
    expect(titleGame("10/29 Game Night — ", core, "2026-10-29")).toBeNull();
  });

  it("matches a template without a game only exactly", () => {
    expect(titleGame("10/29 Casual Night", casual, "2026-10-29")).toBe("");
    expect(titleGame("10/29 Casual Night at Sam's", casual, "2026-10-29")).toBeNull();
  });
});

describe("retitle", () => {
  it("swaps in the locked-in game, typed in by hand or not", () => {
    expect(retitle("10/29 Game Night — TBD", core, "2026-10-29", "Root")).toBe("10/29 Game Night — Root");
    expect(retitle("10/29 Game Night — Brass", core, "2026-10-29", "Root")).toBe("10/29 Game Night — Root");
  });

  it("goes back to TBD when the game is unlocked", () => {
    expect(retitle("10/29 Game Night — Root", core, "2026-10-29", null)).toBe("10/29 Game Night — TBD");
  });

  it("leaves a title named by hand alone", () => {
    expect(retitle("Thursday heavy", core, "2026-10-29", "Root")).toBe("Thursday heavy");
  });
});
