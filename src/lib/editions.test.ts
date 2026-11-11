import { describe, expect, it } from "vitest";
import { editionGroups, mergeEditions } from "./editions";

type Game = {
  id: number;
  name: string;
  implementations: number[] | null;
  ownerIds: string[];
  plays: number;
  lastPlayed: string | null;
  sentiments: { userId: string; sentiment: string }[];
  wantToPlay: string[];
  mustPlay: string[];
};
const game = (id: number, name: string, extra: Partial<Game> = {}): Game => ({
  id,
  name,
  implementations: null,
  ownerIds: [],
  plays: 0,
  lastPlayed: null,
  sentiments: [],
  wantToPlay: [],
  mustPlay: [],
  ...extra,
});

describe("mergeEditions", () => {
  it("shows two editions once, with both copies and every play", () => {
    const shelf = mergeEditions([
      game(478, "Citadels", { ownerIds: ["casey"], implementations: [205398, 462402] }),
      game(205398, "Citadels", { ownerIds: ["sam"], plays: 1, lastPlayed: "2026-08-23", implementations: [478] }),
      game(13, "Catan", { ownerIds: ["alex"] }),
    ]);
    expect(shelf.map((g) => [g.id, g.ownerIds, g.plays, g.lastPlayed])).toEqual([
      [205398, ["casey", "sam"], 1, "2026-08-23"],
      [13, ["alex"], 0, null],
    ]);
  });

  it("goes to the edition played most, then the one most people own", () => {
    expect(mergeEditions([game(1, "Root", { ownerIds: ["sam"], implementations: [2] }), game(2, "ROOT", { ownerIds: ["alex", "casey"] })])[0].id).toBe(2);
    expect(mergeEditions([game(1, "Root", { plays: 3 }), game(2, "Root", { ownerIds: ["alex", "casey"], implementations: [1] })])[0].id).toBe(1);
  });

  it("keeps someone's opinion on the main edition over one on another, and adds everyone else's", () => {
    const [merged] = mergeEditions([
      game(1, "Citadels", { plays: 2, implementations: [2], sentiments: [{ userId: "sam", sentiment: "love" }], wantToPlay: ["sam"] }),
      game(2, "Citadels", {
        sentiments: [
          { userId: "sam", sentiment: "meh" },
          { userId: "alex", sentiment: "like" },
        ],
        wantToPlay: ["sam", "alex"],
        mustPlay: ["jordan"],
      }),
    ]);
    expect(merged.sentiments).toEqual([
      { userId: "sam", sentiment: "love" },
      { userId: "alex", sentiment: "like" },
    ]);
    expect(merged.wantToPlay).toEqual(["sam", "alex"]);
    expect(merged.mustPlay).toEqual(["jordan"]);
  });

  it("leaves games with different names alone", () => {
    const shelf = [game(1, "Citadels"), game(2, "Citadels: Dark City")];
    expect(mergeEditions(shelf)).toEqual(shelf);
  });
});

describe("editionGroups", () => {
  it("needs both BGG's link and the same name", () => {
    const groups = editionGroups([
      { id: 478, name: "Citadels", implementations: [205398, 462402, 13291] },
      { id: 205398, name: "Citadels", implementations: null },
      { id: 462402, name: "Citadels Duel", implementations: [478] },
      { id: 13291, name: "Citadels: The Dark City", implementations: null },
      { id: 9, name: "Citadels", implementations: [] },
    ]);
    expect([...groups]).toEqual([
      [478, 478],
      [205398, 478],
      [462402, 462402],
      [13291, 13291],
      [9, 9],
    ]);
  });

  it("joins a chain of editions, each linked only to the one before", () => {
    const groups = editionGroups([
      { id: 3, name: "Tikal", implementations: [2] },
      { id: 2, name: "Tikal", implementations: [1] },
      { id: 1, name: "Tikal", implementations: null },
    ]);
    expect(new Set(groups.values())).toEqual(new Set([1]));
  });
});
