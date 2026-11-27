import { describe, expect, it } from "vitest";
import { expiryFor, hashToken, linkPath, linkProblem, newToken } from "./access-links";

const now = new Date("2026-11-24T18:00:00Z");
const link = { kind: "invite", once: true, uses: 0, expiresAt: expiryFor(24, now), closedAt: null } as const;

describe("linkProblem", () => {
  it("works until it's used, expires or is turned off", () => {
    expect(linkProblem(link, 30, now)).toBeNull();
    expect(linkProblem({ ...link, uses: 1 }, 30, now)).toBe("used");
    expect(linkProblem({ ...link, closedAt: now }, 30, now)).toBe("closed");
    expect(linkProblem(link, 30, expiryFor(24, now))).toBe("expired");
  });

  it("lets a group's invite be used again, up to a point", () => {
    expect(linkProblem({ ...link, once: false, uses: 5 }, 30, now)).toBeNull();
    expect(linkProblem({ ...link, once: false, uses: 30 }, 30, now)).toBe("used");
    // The group can change its mind about links already out
    expect(linkProblem({ ...link, once: false, uses: 5 }, 5, now)).toBe("used");
  });
});

describe("tokens", () => {
  it("are long, different each time, and kept only as a hash", () => {
    const a = newToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
    expect(linkPath("invite", "abc")).toBe("/join/abc");
  });
});
