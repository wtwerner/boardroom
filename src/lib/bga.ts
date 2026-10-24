import "server-only";

/**
 * Board Game Arena has no public API. Its game list page embeds the whole catalog as
 * JSON (`"game_list":[…]`), BGG ids included, and it's served without signing in.
 * Player histories are not: they need a BGA session, so plays aren't imported.
 */
const GAME_LIST_URL = "https://boardgamearena.com/gamelist?section=all";

export type BgaGame = {
  id: number;
  /** BGA's game name in URLs, e.g. "arknova" */
  slug: string;
  name: string;
  bggId: number | null;
  /** Only the person who opens the table needs Premium */
  premium: boolean;
  playerCounts: number[];
  /** Minutes, as BGA measures it. Runs well under real play time, so it isn't shown. */
  averageDuration: number | null;
  realtime: boolean;
  turnBased: boolean;
  beta: boolean;
  gamesPlayed: number;
};

export const bgaGameUrl = (slug: string) => `https://boardgamearena.com/gamepanel?game=${encodeURIComponent(slug)}`;

/** "2–4p, real-time or turn-based" */
export function bgaFacts(b: Pick<BgaGame, "playerCounts" | "realtime" | "turnBased" | "beta">) {
  const [min, max] = [Math.min(...b.playerCounts), Math.max(...b.playerCounts)];
  return [
    b.playerCounts.length ? (min === max ? `${min}p` : `${min}–${max}p`) : null,
    b.turnBased && b.realtime ? "real-time or turn-based" : b.turnBased ? "turn-based only" : "real-time only",
    b.beta ? "in beta" : null,
  ].filter(Boolean);
}

type RawGame = {
  id: number;
  name: string;
  display_name_en?: string;
  status?: string;
  bgg_id?: number;
  premium?: boolean;
  player_numbers?: number[];
  average_duration?: number | null;
  realtime?: string;
  turnbased?: string;
  games_played?: number;
};

/** The JSON array that starts at `from`, found by matching brackets outside strings. */
function sliceArray(text: string, from: number) {
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return text.slice(from, i + 1);
  }
  return null;
}

/** The games in BGA's game list page. Alpha games (not open to everyone yet) are left out. */
export function parseGameList(html: string): BgaGame[] {
  const key = html.indexOf('"game_list":');
  const start = key === -1 ? -1 : html.indexOf("[", key);
  const json = start === -1 ? null : sliceArray(html, start);
  if (!json) throw new Error("BGA's game list page has changed: no game list found in it");

  return (JSON.parse(json) as RawGame[])
    .filter((g) => g.status === "public" || g.status === "beta")
    .map((g) => ({
      id: g.id,
      slug: g.name,
      name: g.display_name_en || g.name,
      bggId: g.bgg_id || null,
      premium: Boolean(g.premium),
      playerCounts: g.player_numbers ?? [],
      averageDuration: g.average_duration || null,
      // "notreco" means it works but BGA doesn't recommend it
      realtime: g.realtime !== "no",
      turnBased: g.turnbased !== "no",
      beta: g.status === "beta",
      gamesPlayed: g.games_played ?? 0,
    }));
}

export async function fetchBgaGames(): Promise<BgaGame[]> {
  const res = await fetch(GAME_LIST_URL, {
    headers: { "User-Agent": "boardroom (a private board game group site; one request a night)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`BGA's game list returned ${res.status}`);
  return parseGameList(await res.text());
}
