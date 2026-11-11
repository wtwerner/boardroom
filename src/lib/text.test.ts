import { describe, expect, it } from "vitest";
import { inSentence } from "./text";

describe("inSentence", () => {
  it("lowercases a sentence-cased name", () => {
    expect(inSentence("Casual night")).toBe("casual night");
    expect(inSentence("Game night")).toBe("game night");
  });

  it("keeps a name the group capitalized as a proper name", () => {
    expect(inSentence("Game Night")).toBe("Game Night");
    expect(inSentence("BGG night")).toBe("BGG night");
    expect(inSentence("Strategy")).toBe("Strategy");
    expect(inSentence("game night")).toBe("game night");
  });
});
