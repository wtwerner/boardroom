import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accessChangeRefusal, capabilities, roleMismatch, signInAccess } from "./access";

const first = { inServer: true, hasRole: false, existing: null, casualSignIn: false, casualNight: true } as const;

describe("signInAccess", () => {
  it("turns away anyone not in the server, whatever Boardroom says", () => {
    expect(signInAccess({ ...first, inServer: false, existing: "member" })).toEqual({ ok: false, refusal: "not_in_server" });
  });

  it("goes by the role the first time", () => {
    expect(signInAccess({ ...first, hasRole: true })).toEqual({ ok: true, access: "member" });
    expect(signInAccess(first)).toEqual({ ok: false, refusal: "missing_role" });
    expect(signInAccess({ ...first, casualSignIn: true })).toEqual({ ok: true, access: "casual" });
  });

  it("lets everyone in as a member without a role, unless new people start casual", () => {
    expect(signInAccess({ ...first, hasRole: null })).toEqual({ ok: true, access: "member" });
    expect(signInAccess({ ...first, hasRole: null, casualSignIn: true })).toEqual({ ok: true, access: "casual" });
  });

  it("goes by Boardroom after that, not the role", () => {
    expect(signInAccess({ ...first, hasRole: false, existing: "member" })).toEqual({ ok: true, access: "member" });
    expect(signInAccess({ ...first, hasRole: true, existing: "casual" })).toEqual({ ok: true, access: "casual" });
    // Casual sign-in turned off later doesn't lock out casual accounts an admin let stay
    expect(signInAccess({ ...first, existing: "casual" })).toEqual({ ok: true, access: "casual" });
  });

  it("keeps casual accounts out while there's no casual night, and lets members in", () => {
    expect(signInAccess({ ...first, existing: "casual", casualNight: false })).toEqual({ ok: false, refusal: "missing_role" });
    expect(signInAccess({ ...first, existing: "member", casualNight: false })).toEqual({ ok: true, access: "member" });
  });

  it("keeps someone removed out, without saying so", () => {
    expect(signInAccess({ ...first, hasRole: true, existing: "removed", casualSignIn: true })).toEqual({ ok: false, refusal: "missing_role" });
  });
});

describe("accessChangeRefusal", () => {
  const casey = { id: "u-casey", access: "casual", isAdmin: false } as const;
  const sam = { id: "u-sam", access: "member", isAdmin: true } as const;

  it("lets an admin move someone up, down or out", () => {
    expect(accessChangeRefusal("u-sam", casey, "member")).toBeNull();
    expect(accessChangeRefusal("u-sam", { ...casey, access: "member" }, "casual")).toBeNull();
    expect(accessChangeRefusal("u-sam", casey, "removed")).toBeNull();
  });

  it("never their own access, and not an admin's until their admin is taken away", () => {
    expect(accessChangeRefusal("u-sam", sam, "casual")).toMatch(/your own/);
    expect(accessChangeRefusal("u-alex", sam, "removed")).toMatch(/admin/);
    expect(accessChangeRefusal("u-alex", sam, "member")).toBeNull();
  });
});

describe("roleMismatch", () => {
  it("flags a casual account with the role, and a member without it", () => {
    expect(roleMismatch("casual", true)).toBe("extra-role");
    expect(roleMismatch("removed", true)).toBe("extra-role");
    expect(roleMismatch("member", false)).toBe("missing-role");
  });

  it("says nothing when they agree, or there's no role to compare", () => {
    expect(roleMismatch("member", true)).toBeNull();
    expect(roleMismatch("casual", false)).toBeNull();
    expect(roleMismatch("casual", null)).toBeNull();
  });
});

describe("capabilities", () => {
  const rows = capabilities({ core: "Game night", casual: "Open night" });
  const source = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  const actions = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  /** The first check an action makes: requireUser, requireMember or requireAdmin */
  const gate = (name: string) => source.match(new RegExp(`^export async function ${name}\\b[\\s\\S]*?require(User|Member|Admin)\\(`, "m"))?.[1];
  // Not something the table describes: members-only inside, and a read the event page polls
  const outside = ["previewCasual", "getNightsVersion"];

  it("has a row for every action", () => {
    const listed = rows.flatMap((r) => r.actions);
    expect(actions.filter((a) => !listed.includes(a) && !outside.includes(a))).toEqual([]);
    expect(listed.filter((a) => !actions.includes(a))).toEqual([]);
  });

  it("matches what each action checks first", () => {
    for (const row of rows) {
      const expected = row.member === "no" ? "Admin" : row.casual === "no" ? "Member" : "User";
      for (const action of row.actions) expect({ action, gate: gate(action) }).toEqual({ action, gate: expected });
    }
  });
});
