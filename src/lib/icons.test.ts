import { describe, expect, it } from "vitest";
import { appEmoji, buttonEmoji, icon } from "./icons";

describe("icon", () => {
  it("uses the bot's own emoji once it has been uploaded", () => {
    expect(icon({ date: "10000000000000010" }, "date")).toBe("<:date:10000000000000010>");
    expect(buttonEmoji({ going: "10000000000000011" }, "going")).toEqual({ id: "10000000000000011", name: "going" });
  });

  it("falls back to a plain emoji until then", () => {
    expect(icon({}, "date")).toBe("📅");
    expect(buttonEmoji({}, "going")).toEqual({ name: "✅" });
  });
});

describe("appEmoji", () => {
  it("keeps only the bot's emoji that are its symbols", () => {
    expect(
      appEmoji([
        { id: "10000000000000010", name: "date" },
        { id: "10000000000000012", name: "partyparrot" },
      ]),
    ).toEqual({ date: "10000000000000010" });
  });
});
