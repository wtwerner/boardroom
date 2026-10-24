import { describe, expect, it } from "vitest";
import { setupProgress, setupSteps } from "./setup";

const fresh = { needsClaim: false, rateDone: false, rankDone: false, collection: false, bga: false };

describe("setupSteps", () => {
  it("asks to find yourself in past plays only while it's needed", () => {
    expect(setupSteps(fresh).map((s) => s.key)).toEqual(["rate", "rank", "bgg", "bga"]);
    expect(setupSteps({ ...fresh, needsClaim: true })[0]).toMatchObject({ key: "claim", done: false, optional: false });
  });

  it("marks the integrations optional", () => {
    expect(setupSteps(fresh).filter((s) => s.optional).map((s) => s.key)).toEqual(["bgg", "bga"]);
  });
});

describe("setupProgress", () => {
  it("counts only the steps that matter, and names the next one", () => {
    const p = setupProgress(setupSteps({ ...fresh, rateDone: true, collection: true }));
    expect(p).toMatchObject({ done: 1, total: 2, complete: false });
    expect(p.next?.key).toBe("rank");
  });

  it("is complete without BGG or BGA", () => {
    expect(setupProgress(setupSteps({ ...fresh, rateDone: true, rankDone: true }))).toMatchObject({ complete: true, next: null });
  });
});
