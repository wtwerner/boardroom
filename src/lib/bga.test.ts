import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseGameList } = await import("./bga");

// Trimmed from the real page: the list sits inside a larger object in an inline script
const page = (games: object[]) =>
  `<script>var globalUserInfos={"user_rights":["connect"],"table_infos":{"tables":[]},"game_list":${JSON.stringify(games)},"other":[1,2]};</script>`;

const arkNova = {
  id: 1741,
  name: "arknova",
  display_name_en: "Ark Nova",
  status: "public",
  premium: true,
  bgg_id: 342942,
  player_numbers: [1, 2, 3, 4],
  average_duration: 46,
  realtime: "yes",
  turnbased: "yes",
  games_played: 13745163,
  tags: [[4, 0], [12, 0]],
  media: { title: { en: "1679388417" } },
};

describe("parseGameList", () => {
  it("reads each game's BGA and BGG ids, player counts and how it can be played", () => {
    expect(parseGameList(page([arkNova]))).toEqual([
      {
        id: 1741,
        slug: "arknova",
        name: "Ark Nova",
        bggId: 342942,
        premium: true,
        playerCounts: [1, 2, 3, 4],
        averageDuration: 46,
        realtime: true,
        turnBased: true,
        beta: false,
        gamesPlayed: 13745163,
      },
    ]);
  });

  it("keeps open beta games, drops alpha ones, and treats a missing BGG id (0) as none", () => {
    const games = parseGameList(
      page([
        { ...arkNova, id: 2, name: "luthier", display_name_en: "Luthier", status: "beta", bgg_id: 0, turnbased: "no", realtime: "notreco" },
        { ...arkNova, id: 3, name: "secret", status: "alpha" },
      ]),
    );
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ slug: "luthier", beta: true, bggId: null, turnBased: false, realtime: true });
  });

  it("isn't thrown by brackets and quotes inside names", () => {
    const games = parseGameList(page([{ ...arkNova, display_name_en: 'Odd "[name]" \\ ]' }, { ...arkNova, id: 9 }]));
    expect(games.map((g) => g.name)).toEqual(['Odd "[name]" \\ ]', "Ark Nova"]);
  });

  it("fails loudly when the page no longer has the list", () => {
    expect(() => parseGameList("<html>Maintenance</html>")).toThrow(/changed/);
  });
});
