import { describe, expect, it } from "vitest";
import { setupProblem } from "./setup-code";

describe("setupProblem", () => {
  const fresh = { accounts: 0, discordSignIn: false, demo: false, dev: false, code: "a long setup code", given: "a long setup code" };

  it("lets whoever has the code set up a new site", () => {
    expect(setupProblem(fresh)).toBeNull();
    expect(setupProblem({ ...fresh, given: "a guess" })).toMatch(/isn't the site's setup code/);
    expect(setupProblem({ ...fresh, given: "" })).not.toBeNull();
  });

  it("never opens a site whose code isn't set, or is too short to mean anything", () => {
    expect(setupProblem({ ...fresh, code: undefined, given: "" })).toMatch(/Set SETUP_CODE/);
    expect(setupProblem({ ...fresh, code: "short", given: "short" })).toMatch(/too short/);
  });

  it("only sets a site up once, and never one with Discord sign-in or a demo", () => {
    for (const no of [{ accounts: 1 }, { discordSignIn: true }, { demo: true }]) expect(setupProblem({ ...fresh, ...no })).toMatch(/already set up/);
  });

  it("needs no code in local development", () => {
    expect(setupProblem({ ...fresh, dev: true, code: undefined, given: "" })).toBeNull();
    expect(setupProblem({ ...fresh, dev: true, accounts: 4 })).toMatch(/already set up/);
  });
});
