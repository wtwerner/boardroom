import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseThings } = await import("./bgg");

// Trimmed from a real /thing?stats=1 response
const XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="224517">
    <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
    <description>Build canals&amp;mdash;then rails.&amp;#10;&amp;#10;Uses the &amp;Uuml;berplay art, it&amp;rsquo;s &amp;ldquo;great&amp;rdquo; &amp;amp; more.&amp;#10;&amp;#10;&amp;mdash;description from the publisher</description>
    <name type="primary" sortindex="1" value="Brass: Birmingham" />
    <name type="alternate" sortindex="1" value="Брасс: Бирмингем" />
    <yearpublished value="2018" />
    <minplayers value="2" /><maxplayers value="4" />
    <poll name="suggested_numplayers" title="User Suggested Number of Players" totalvotes="1">
      <results numplayers="2"><result value="Best" numvotes="10" /><result value="Recommended" numvotes="50" /><result value="Not Recommended" numvotes="5" /></results>
      <results numplayers="3"><result value="Best" numvotes="80" /><result value="Recommended" numvotes="20" /><result value="Not Recommended" numvotes="1" /></results>
      <results numplayers="4"><result value="Best" numvotes="90" /><result value="Recommended" numvotes="10" /><result value="Not Recommended" numvotes="1" /></results>
    </poll>
    <playingtime value="120" /><minplaytime value="60" /><maxplaytime value="120" />
    <link type="boardgamecategory" id="1021" value="Economic" />
    <link type="boardgamemechanic" id="2040" value="Hand Management" />
    <statistics page="1"><ratings>
      <average value="8.56" />
      <ranks>
        <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="1" bayesaverage="8.4" />
        <rank type="family" id="5497" name="strategygames" friendlyname="Strategy Game Rank" value="1" bayesaverage="8.4" />
      </ranks>
      <averageweight value="3.87" />
    </ratings></statistics>
  </item>
  <item type="boardgameexpansion" id="1">
    <name type="primary" sortindex="1" value="Some Expansion" />
    <statistics page="1"><ratings><average value="7" /><ranks><rank type="subtype" id="1" name="boardgame" value="Not Ranked" /></ranks></ratings></statistics>
  </item>
</items>`;

describe("parseThings", () => {
  it("reads attributes named `name` as strings (ranks and polls)", () => {
    const [brass, exp] = parseThings(XML);
    expect(brass).toMatchObject({
      id: 224517,
      name: "Brass: Birmingham",
      bggRank: 1,
      bestPlayers: [3, 4],
      weight: 3.87,
      categories: ["Economic"],
      mechanics: ["Hand Management"],
      expansion: false,
    });
    expect(exp).toMatchObject({ expansion: true, bggRank: null });
  });

  it("decodes descriptions, which BGG escapes twice", () => {
    const [brass] = parseThings(XML);
    expect(brass.description).toBe("Build canals—then rails.\n\nUses the Überplay art, it’s “great” & more.\n\n—description from the publisher");
  });
});

describe("mergeCollectionEntries", () => {
  it("keeps one entry per game, with every status and the higher rating", async () => {
    const { mergeCollectionEntries } = await import("./bgg");
    const base = { name: "Potion Explosion", year: 2015, thumbnail: null, image: null, wishlist: false, wantToPlay: false, prevOwned: false };
    const merged = mergeCollectionEntries([
      { ...base, id: 180974, own: true, userRating: null },
      { ...base, id: 180974, own: false, wishlist: true, userRating: 7 },
      { ...base, id: 1, name: "Other", own: true, userRating: 6 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 180974, own: true, wishlist: true, userRating: 7 });
  });
});
