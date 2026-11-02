import { describe, expect, it } from "vitest";
import { bggPrepLinks, bggSlug, bggUrl } from "./bgg-links";

describe("bggSlug", () => {
  it("makes a slug from the name", () => {
    expect(bggSlug("The Castles of Burgundy")).toBe("the-castles-of-burgundy");
    expect(bggSlug("Brass: Birmingham")).toBe("brass-birmingham");
    expect(bggSlug("Tzolk'in: The Mayan Calendar")).toBe("tzolkin-the-mayan-calendar");
    expect(bggSlug("Café International")).toBe("cafe-international");
  });

  it("never comes out empty, so the page stays in its place", () => {
    expect(bggSlug("???")).toBe("game");
  });
});

describe("bggUrl", () => {
  it("puts the page after the slug", () => {
    expect(bggUrl(84876, "The Castles of Burgundy", "files")).toBe("https://boardgamegeek.com/boardgame/84876/the-castles-of-burgundy/files");
    expect(bggUrl(84876, "The Castles of Burgundy")).toBe("https://boardgamegeek.com/boardgame/84876/the-castles-of-burgundy");
  });

  it("links the rules files and the instructional videos for prep", () => {
    expect(bggPrepLinks(266192, "Wingspan").map((l) => l.url)).toEqual([
      "https://boardgamegeek.com/boardgame/266192/wingspan/files",
      "https://boardgamegeek.com/boardgame/266192/wingspan/videos/instructional",
    ]);
  });
});
