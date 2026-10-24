import { describe, expect, it } from "vitest";
import { matchByName, playerLabels } from "./players";

describe("matchByName", () => {
  const sam = { id: 1, name: "Sam", aliases: ["sammy"], userId: "u-sam", memberName: "samw" };
  const alex = { id: 2, name: "Alex", aliases: [], userId: null };
  const casey = { id: 3, name: "Casey", aliases: [], userId: null };

  it("finds the one player with that name, alias or account name, ignoring case and spaces", () => {
    expect(matchByName([sam, alex], " ALEX ")).toEqual({ player: alex });
    expect(matchByName([sam, alex], "Sammy")).toEqual({ player: sam });
    expect(matchByName([sam, alex], "samw")).toEqual({ player: sam });
  });

  it("is nobody for a new name or no name", () => {
    expect(matchByName([sam, alex], "Jordan")).toBeNull();
    expect(matchByName([sam, alex], "  ")).toBeNull();
  });

  it("doesn't pick between two players with the same name", () => {
    const otherCasey = { id: 4, name: "casey", aliases: [], userId: null };
    expect(matchByName([casey, otherCasey], "Casey")).toEqual({ ambiguous: [casey, otherCasey] });
  });

  it("counts an alias on one and a name on the other as two", () => {
    const renamed = { id: 5, name: "Casey K", aliases: ["casey"], userId: null };
    expect(matchByName([renamed, casey], "casey")).toEqual({ ambiguous: [casey, renamed] });
  });

  it("lists a member first when a guest has their name too", () => {
    const guestSam = { id: 0, name: "Sam", aliases: [], userId: null };
    expect(matchByName([guestSam, sam], "sam")).toEqual({ ambiguous: [sam, guestSam] });
  });
});

describe("playerLabels", () => {
  it("is just the name when nobody else has it", () => {
    expect(playerLabels([{ id: 1, name: "Sam", firstPlayed: "2025-09-28" }]).get(1)).toBe("Sam");
  });

  it("says when each started playing when two share a name", () => {
    const labels = playerLabels([
      { id: 1, name: "Casey", firstPlayed: "2025-09-28" },
      { id: 2, name: "casey", firstPlayed: "2025-10-16" },
      { id: 3, name: "Casey", firstPlayed: null },
      { id: 4, name: "Sam", firstPlayed: "2025-10-16" },
    ]);
    expect([...labels.values()]).toEqual(["Casey (since Sep 2025)", "casey (since Oct 2025)", "Casey (no plays yet)", "Sam"]);
  });

  it("gives the day when they started the same month", () => {
    const labels = playerLabels([
      { id: 1, name: "Casey", firstPlayed: "2025-10-02" },
      { id: 2, name: "Casey", firstPlayed: "2025-10-16" },
    ]);
    expect([...labels.values()]).toEqual(["Casey (since Oct 2, 2025)", "Casey (since Oct 16, 2025)"]);
  });
});
