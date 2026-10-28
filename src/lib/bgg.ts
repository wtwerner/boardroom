import "server-only";
import { decodeHTMLStrict } from "entities";
import { XMLParser } from "fast-xml-parser";
import Papa from "papaparse";

// The token is ignored on www.boardgamegeek.com — must be the bare domain.
const API = "https://boardgamegeek.com/xmlapi2";

export type BggCollectionEntry = {
  id: number;
  name: string;
  year: number | null;
  thumbnail: string | null;
  image: string | null;
  own: boolean;
  wishlist: boolean;
  wantToPlay: boolean;
  prevOwned: boolean;
  userRating: number | null;
};

export type BggGameDetails = {
  id: number;
  name: string;
  year: number | null;
  thumbnail: string | null;
  image: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  bestPlayers: number[];
  minPlaytime: number | null;
  maxPlaytime: number | null;
  weight: number | null;
  bggRating: number | null;
  bggRank: number | null;
  categories: string[];
  mechanics: string[];
  description: string | null;
  expansion: boolean;
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  htmlEntities: true,
  // Elements only: attributes such as <rank name="boardgame"> and <poll name="..."> must stay strings
  isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ["item", "name", "link", "results", "result", "rank", "poll"].includes(name),
});

export const hasBggToken = () => Boolean(process.env.BGG_API_TOKEN);

/**
 * BGG escapes its descriptions twice ("&amp;mdash;" in the XML), so after parsing they still
 * read "&mdash;", "&rsquo;" and so on. One more decode gives the text people wrote. Strict, so
 * only complete entities ending in ";" change: "R&D" or "&copy" without one are left alone.
 */
const bggText = (s: string) => decodeHTMLStrict(s);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;

/** BGG throttles aggressively; space requests out and retry "queued" (202) responses. */
async function bggFetch(path: string): Promise<string> {
  const token = process.env.BGG_API_TOKEN;
  if (!token) throw new Error("BGG_API_TOKEN is not set — use the CSV import until BGG approves your app");

  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = lastRequestAt + 2000 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 202 = collection export queued; 429/503 = slow down
    if (res.status === 202 || res.status === 429 || res.status === 503) {
      await sleep(Math.min(3000 * 2 ** attempt, 30_000));
      continue;
    }
    if (!res.ok) throw new Error(`BGG ${path} → ${res.status}`);
    return res.text();
  }
  throw new Error(`BGG ${path} → still queued after retries, try again in a minute`);
}

// fast-xml-parser gives us loosely-typed trees
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === undefined || v === "" || Number.isNaN(n) || n === 0 ? null : n;
};
const attr = (node: Node) => (node && typeof node === "object" ? node.value : undefined);

/**
 * One entry per game. BGG lists a game twice when someone has two copies or two
 * collection records for it; keep every status either one has and the higher rating.
 */
export function mergeCollectionEntries(entries: BggCollectionEntry[]): BggCollectionEntry[] {
  const byId = new Map<number, BggCollectionEntry>();
  for (const e of entries) {
    const prev = byId.get(e.id);
    byId.set(
      e.id,
      prev
        ? {
            ...prev,
            thumbnail: prev.thumbnail ?? e.thumbnail,
            image: prev.image ?? e.image,
            own: prev.own || e.own,
            wishlist: prev.wishlist || e.wishlist,
            wantToPlay: prev.wantToPlay || e.wantToPlay,
            prevOwned: prev.prevOwned || e.prevOwned,
            userRating: Math.max(prev.userRating ?? 0, e.userRating ?? 0) || null,
          }
        : e,
    );
  }
  return [...byId.values()];
}

export async function fetchCollection(username: string): Promise<BggCollectionEntry[]> {
  const body = await bggFetch(
    `/collection?username=${encodeURIComponent(username)}&subtype=boardgame&excludesubtype=boardgameexpansion&stats=1`,
  );
  const doc = xml.parse(body);
  if (doc.errors) throw new Error(`BGG: ${JSON.stringify(doc.errors)}`);
  const items: Node[] = doc.items?.item ?? [];

  return items.map((it) => ({
    id: Number(it.objectid),
    name: String(it.name?.[0]?.["#text"] ?? it.name?.[0] ?? ""),
    year: num(it.yearpublished),
    thumbnail: it.thumbnail ?? null,
    image: it.image ?? null,
    own: it.status?.own === "1",
    wishlist: it.status?.wishlist === "1",
    wantToPlay: it.status?.wanttoplay === "1",
    prevOwned: it.status?.prevowned === "1",
    userRating: num(it.stats?.rating?.value),
  }));
}

export async function fetchGameDetails(ids: number[]): Promise<BggGameDetails[]> {
  const out: BggGameDetails[] = [];
  // /thing accepts at most 20 ids per request
  for (let i = 0; i < ids.length; i += 20) {
    out.push(...parseThings(await bggFetch(`/thing?id=${ids.slice(i, i + 20).join(",")}&stats=1`)));
  }
  return out;
}

export function parseThings(body: string): BggGameDetails[] {
  const items: Node[] = xml.parse(body).items?.item ?? [];
  return items.map(toDetails);
}

function toDetails(it: Node): BggGameDetails {
  const names: Node[] = it.name ?? [];
  const links: Node[] = it.link ?? [];
  const ratings = it.statistics?.ratings;
  const rank = (ratings?.ranks?.rank as Node[] | undefined)?.find((r) => r.name === "boardgame");

  return {
    id: Number(it.id),
    name: (names.find((n) => n.type === "primary") ?? names[0])?.value ?? "Unknown",
    year: num(attr(it.yearpublished)),
    thumbnail: it.thumbnail ?? null,
    image: it.image ?? null,
    minPlayers: num(attr(it.minplayers)),
    maxPlayers: num(attr(it.maxplayers)),
    bestPlayers: bestPlayerCounts(it.poll),
    minPlaytime: num(attr(it.minplaytime)) ?? num(attr(it.playingtime)),
    maxPlaytime: num(attr(it.maxplaytime)) ?? num(attr(it.playingtime)),
    weight: num(attr(ratings?.averageweight)),
    bggRating: num(attr(ratings?.average)),
    bggRank: num(rank?.value),
    categories: links.filter((l) => l.type === "boardgamecategory").map((l) => l.value),
    mechanics: links.filter((l) => l.type === "boardgamemechanic").map((l) => l.value),
    description: typeof it.description === "string" ? bggText(it.description).slice(0, 2000) : null,
    expansion: it.type === "boardgameexpansion",
  };
}

/** BGG's "hotness" list: the ~50 games people are looking at right now, hottest first. */
export async function fetchHotGames(): Promise<number[]> {
  const body = await bggFetch("/hot?type=boardgame");
  const items: Node[] = xml.parse(body).items?.item ?? [];
  return items.map((it) => Number(it.id)).filter(Boolean);
}

/** Player counts where "Best" got the most votes in BGG's suggested_numplayers poll. */
function bestPlayerCounts(polls: Node[] | undefined): number[] {
  const poll = polls?.find((p) => p.name === "suggested_numplayers");
  const out: number[] = [];
  for (const r of (poll?.results as Node[] | undefined) ?? []) {
    const votes = Object.fromEntries((r.result as Node[]).map((x) => [x.value, Number(x.numvotes)]));
    const n = Number(String(r.numplayers).replace("+", ""));
    if (votes.Best > 0 && votes.Best >= (votes.Recommended ?? 0) && votes.Best >= (votes["Not Recommended"] ?? 0)) {
      if (!Number.isNaN(n)) out.push(n);
    }
  }
  return out;
}

export async function searchGames(query: string): Promise<{ id: number; name: string; year: number | null }[]> {
  const run = async (exact: boolean) => {
    const body = await bggFetch(
      `/search?query=${encodeURIComponent(query)}&type=boardgame${exact ? "&exact=1" : ""}`,
    );
    const items: Node[] = xml.parse(body).items?.item ?? [];
    return items.map((it) => ({
      id: Number(it.id),
      name: (it.name as Node[])[0]?.value ?? query,
      year: num(attr(it.yearpublished)),
    }));
  };
  const exact = await run(true);
  return exact.length ? exact : run(false);
}

// ---------------------------------------------------------------------------
// CSV fallback: BGG → Collection → "Download" (works without an API token)
// ---------------------------------------------------------------------------

export type CsvImport = { entries: BggCollectionEntry[]; details: BggGameDetails[] };

export function parseCollectionCsv(csv: string): CsvImport {
  const { data } = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
  const entries: BggCollectionEntry[] = [];
  const details: BggGameDetails[] = [];

  for (const row of data) {
    const id = Number(row.objectid);
    if (!id || (row.objecttype && row.objecttype !== "thing")) continue;
    if (row.itemtype && row.itemtype !== "standalone") continue; // skip expansions

    const name = row.objectname ?? row.originalname ?? "Unknown";
    const year = num(row.yearpublished);
    entries.push({
      id,
      name,
      year,
      thumbnail: null,
      image: null,
      own: row.own === "1",
      wishlist: row.wishlist === "1",
      wantToPlay: row.wanttoplay === "1",
      prevOwned: row.prevowned === "1",
      userRating: num(row.rating),
    });
    details.push({
      id,
      name,
      year,
      thumbnail: null,
      image: null,
      minPlayers: num(row.minplayers),
      maxPlayers: num(row.maxplayers),
      bestPlayers: parseCountList(row.bggbestplayers),
      minPlaytime: num(row.minplaytime) ?? num(row.playingtime),
      maxPlaytime: num(row.maxplaytime) ?? num(row.playingtime),
      weight: num(row.avgweight),
      bggRating: num(row.average),
      bggRank: num(row.rank),
      categories: [],
      mechanics: [],
      description: null,
      expansion: false,
    });
  }
  return { entries, details };
}

/** "3,4" or "3–4" or "2+" → [3,4] */
function parseCountList(s: string | undefined): number[] {
  if (!s) return [];
  const range = /(\d+)\s*[-–]\s*(\d+)/.exec(s);
  if (range) {
    const out: number[] = [];
    for (let n = +range[1]; n <= +range[2]; n++) out.push(n);
    return out;
  }
  return s
    .split(/[,\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n));
}
