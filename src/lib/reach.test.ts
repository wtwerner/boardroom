import { describe, expect, it } from "vitest";
import { byEmail } from "./reach";

const sam = { discordId: null, email: "sam@example.com", emailVerified: true, emailUpdates: true, access: "member" } as const;

describe("byEmail", () => {
  it("emails someone Discord doesn't reach", () => {
    expect(byEmail(sam, false)).toBe(true);
    expect(byEmail(sam, true)).toBe(true);
    expect(byEmail({ ...sam, discordId: "100000000000000001" }, false)).toBe(true);
  });

  it("never emails someone who heard in Discord", () => {
    expect(byEmail({ ...sam, discordId: "100000000000000001" }, true)).toBe(false);
  });

  it("leaves alone anyone who turned it off, hasn't confirmed, has no real address or is off the site", () => {
    for (const no of [{ emailUpdates: false }, { emailVerified: false }, { email: "1@discord.invalid" }, { access: "removed" as const }]) {
      expect(byEmail({ ...sam, ...no }, false)).toBe(false);
    }
  });
});
