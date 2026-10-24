import { describe, expect, it } from "vitest";
import { discordAppUrl } from "./discord-components";

describe("discordAppUrl", () => {
  it("turns a message link into one the desktop app opens", () => {
    expect(discordAppUrl("https://discord.com/channels/10000000000000001/10000000000000002/10000000000000003")).toBe(
      "discord://-/channels/10000000000000001/10000000000000002/10000000000000003",
    );
    expect(discordAppUrl("https://ptb.discord.com/channels/10000000000000001/10000000000000002")).toBe("discord://-/channels/10000000000000001/10000000000000002");
  });

  it("leaves anything else alone", () => {
    expect(discordAppUrl("https://example.com/channels/1/2")).toBeNull();
    expect(discordAppUrl("https://discord.com/invite/abc")).toBeNull();
  });
});
