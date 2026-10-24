import { describe, expect, it } from "vitest";
import { discordAccountEmail } from "./discord-email";

describe("discordAccountEmail", () => {
  it("keeps the email Discord gives", () => {
    expect(discordAccountEmail({ id: "100000000000000001", email: "sam@example.com" })).toBe("sam@example.com");
  });

  it("gives an account without one a placeholder of its own", () => {
    expect(discordAccountEmail({ id: "100000000000000001", email: null })).toBe("100000000000000001@discord.invalid");
    expect(discordAccountEmail({ id: "100000000000000002" })).toBe("100000000000000002@discord.invalid");
  });
});
