import type { Night, Sentiment } from "@/db/enums";
import { formatBggRating } from "./bgg-ratings";
import { groupRanking } from "./ranking";
import { inSentence } from "./text";

export type NightGame = {
  id: number;
  name: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  bestPlayers: number[] | null;
  /** Player counts most of BGG's voters advise against */
  notRecommendedPlayers: number[] | null;
  minPlaytime: number | null;
  maxPlaytime: number | null;
  weight: number | null;
  ownerIds: string[];
  /** On the night being planned */
  lastPlayedOn: string | null;
  /** Times played on the night being planned */
  playCount: number;
  /** Members who've played it with the group */
  playedBy: string[];
};

export type NightOpinion = {
  userId: string;
  gameId: number;
  sentiment: Sentiment | null;
  wantToPlay: boolean;
  mustPlay: boolean;
};

export type NightInput = {
  games: NightGame[];
  opinions: NightOpinion[];
  /**
   * Everyone's rankings (best first) by user id, one set per tier: a game's place only
   * counts against games of its own tier. Only the people coming count.
   */
  rankings: Record<string, number[]>[];
  /** Signed-in members who are coming (their opinions count) */
  presentUserIds: string[];
  names: Record<string, string>;
  playerCount: number;
  /** Time available in minutes; null = no limit */
  minutes: number | null;
  /** Lowest BGG weight (1–5) worth considering; null = any */
  minWeight?: number | null;
  /** Heaviest BGG weight worth considering; null = any */
  maxWeight?: number | null;
  /** The night being planned: the casual night leans on the games it keeps coming back to */
  night?: Night;
  /** What that night is called, for the reasons shown with each game */
  nightName?: string;
  ownedByPresentOnly: boolean;
  /** Only games none of the people coming have played with the group */
  newOnly?: boolean;
  /**
   * Games people coming haven't rated or ranked: the chance (0–1) each would like it, from
   * their taste (see getTasteChances). Without it a game nobody has played has nothing to go on.
   */
  chances?: Record<number, Record<string, number>>;
  /** People's own BGG ratings by game, then user id: a guess that comes from one says so */
  bggRatings?: Record<number, Record<string, number>>;
  /** Plays people have logged on BGG, by game and then user id: someone who's played it elsewhere can teach it */
  bggPlays?: Record<number, Record<string, number>>;
  today: string; // YYYY-MM-DD
};

export type Reason = { text: string; tone: "good" | "bad" | "neutral" };
export type ScoredGame = { game: NightGame; score: number; reasons: Reason[] };

/**
 * Legacy and campaign-in-a-box games (Gloomhaven, Pandemic Legacy) are a commitment of many
 * nights, not a pick for one, so the planner leaves them out. BGG tags them with this mechanic.
 */
export const isLegacy = (g: { mechanics: string[] | null }) => g.mechanics?.includes("Legacy Game") ?? false;

/** Plays at the casual night that make a game one of its regulars */
const CASUAL_STAPLE_PLAYS = 3;
/** On the casual night, for a game none of the members coming have played: nobody can teach it */
const CASUAL_NO_TEACHER_POINTS = 1.5;

/** A taste guess is worth up to ±2 a person: more than a like, less than a love */
const TASTE_POINTS = 4;
/** Plays logged on BGG that make someone able to teach a game the group hasn't played */
export const KNOWS_IT_PLAYS = 2;
/** BGG's voters say "Best" at this count, or most say "Not Recommended" */
const PLAYER_COUNT_POINTS = 1.5;
/** On the core group's nights, for a game none of them have played: they prep, so it's a draw in itself */
const NEW_GAME_POINTS = 2;

const SENTIMENT_POINTS: Record<Sentiment, number> = { love: 3, like: 1.5, meh: -1, nope: -4 };

export function scoreNight(input: NightInput): ScoredGame[] {
  const present = new Set(input.presentUserIds);
  const opinionsByGame = new Map<number, NightOpinion[]>();
  for (const o of input.opinions) {
    if (!present.has(o.userId)) continue;
    opinionsByGame.set(o.gameId, [...(opinionsByGame.get(o.gameId) ?? []), o]);
  }

  // Where the people coming rank each game among its own tier: 50 is the middle of their lists
  const rankPoints = new Map(
    input.rankings.flatMap((lists) =>
      groupRanking(Object.fromEntries(Object.entries(lists).filter(([id]) => present.has(id)))).map((r) => [r.gameId, r.points] as const),
    ),
  );

  const out: ScoredGame[] = [];
  for (const game of input.games) {
    if (!fitsPlayerCount(game, input.playerCount)) continue;
    if (input.minutes !== null && game.minPlaytime !== null && game.minPlaytime > input.minutes) continue;
    if (input.minWeight && game.weight !== null && game.weight < input.minWeight) continue;
    if (input.maxWeight && game.weight !== null && game.weight > input.maxWeight) continue;
    if (input.ownedByPresentOnly && !game.ownerIds.some((id) => present.has(id))) continue;
    const newToTable = !game.playedBy.some((id) => present.has(id));
    if (input.newOnly && !newToTable) continue;

    let score = 0;
    const reasons: Reason[] = [];
    const ops = opinionsByGame.get(game.id) ?? [];

    const lovers = ops.filter((o) => o.sentiment === "love").map((o) => input.names[o.userId]);
    const naysayers = ops.filter((o) => o.sentiment === "nope").map((o) => input.names[o.userId]);
    const desperate = ops.filter((o) => o.mustPlay).map((o) => input.names[o.userId]);
    const keen = ops.filter((o) => o.wantToPlay).map((o) => input.names[o.userId]);

    for (const o of ops) {
      if (o.sentiment) score += SENTIMENT_POINTS[o.sentiment];
      if (o.wantToPlay) score += 2;
      // Scarce, so worth more than a love; one person's vote can lift a game on its own
      if (o.mustPlay) score += 4;
    }
    if (desperate.length) reasons.push({ text: `🔥 ${list(desperate)} really want${desperate.length > 1 ? "" : "s"} to play it`, tone: "good" });
    if (lovers.length) reasons.push({ text: `${list(lovers)} ${lovers.length > 1 ? "love" : "loves"} it`, tone: "good" });
    if (keen.length) reasons.push({ text: `${list(keen)} want${keen.length > 1 ? "" : "s"} to play it`, tone: "good" });
    if (naysayers.length) reasons.push({ text: `${list(naysayers)} would rather not`, tone: "bad" });

    // What the people who haven't said would likely think, so an unplayed game can compete
    const guesses = Object.entries(input.chances?.[game.id] ?? {}).filter(([id]) => present.has(id));
    for (const [, chance] of guesses) score += (chance - 0.5) * TASTE_POINTS;
    // Someone's own BGG rating answers their guess (getTasteChances), so the label names it
    const onBgg = input.bggRatings?.[game.id] ?? {};
    const fromTaste = guesses.filter(([id]) => onBgg[id] === undefined);
    const fromBgg = guesses.filter(([id]) => onBgg[id] !== undefined);
    const suits = fromTaste.filter(([, c]) => c >= 0.65).map(([id]) => input.names[id]);
    const unlikely = fromTaste.filter(([, c]) => c <= 0.35).map(([id]) => input.names[id]);
    if (suits.length) reasons.push({ text: `Suits ${list(suits)}'s taste`, tone: "good" });
    if (unlikely.length) reasons.push({ text: `Not ${list(unlikely)}'s usual thing`, tone: "bad" });
    const rated = (keep: (c: number) => boolean) => fromBgg.filter(([, c]) => keep(c)).map(([id]) => ({ name: input.names[id], rating: formatBggRating(onBgg[id]) }));
    const high = rated((c) => c >= 0.65);
    const low = rated((c) => c <= 0.35);
    if (high.length) reasons.push({ text: bggReason(high, "highly"), tone: "good" });
    if (low.length) reasons.push({ text: bggReason(low, "low"), tone: "bad" });

    // Up to ±3 from the top or bottom of everyone's list; a game in the middle, or unranked, adds nothing
    const rank = rankPoints.get(game.id);
    if (rank !== undefined) {
      score += ((rank - 50) / 50) * 3;
      if (rank >= 75) reasons.push({ text: "High in your rankings", tone: "good" });
      else if (rank <= 25) reasons.push({ text: "Low in your rankings", tone: "bad" });
    }

    if (game.bestPlayers?.includes(input.playerCount)) {
      score += PLAYER_COUNT_POINTS;
      reasons.push({ text: `Best at ${input.playerCount}`, tone: "good" });
    } else if (game.notRecommendedPlayers?.includes(input.playerCount)) {
      score -= PLAYER_COUNT_POINTS;
      reasons.push({ text: `Not recommended at ${input.playerCount}`, tone: "bad" });
    }

    const casual = input.night === "casual";
    const at = inSentence(input.nightName ?? "Casual night");
    if (game.playCount === 0) {
      const fresh = !casual && newToTable;
      score += fresh ? NEW_GAME_POINTS : 1;
      reasons.push({ text: casual ? `Never played at ${at}` : "Never played together", tone: "neutral" });
    } else if (game.lastPlayedOn) {
      const days = daysBetween(game.lastPlayedOn, input.today);
      if (days <= 14) {
        score -= 2;
        reasons.push({ text: `Played ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`, tone: "bad" });
      } else if (days <= 30) {
        score -= 1;
      } else if (days >= 120) {
        score += 0.5;
        reasons.push({ text: `Not played in ${Math.round(days / 30)} months`, tone: "neutral" });
      }
    }

    // Nobody coming has played it with the group, but someone may have elsewhere: they can teach it
    const elsewhere = Object.entries(input.bggPlays?.[game.id] ?? {}).filter(([id, n]) => present.has(id) && n >= KNOWS_IT_PLAYS);
    if (newToTable && elsewhere.length) reasons.push({ text: knowsIt(elsewhere.map(([id, n]) => ({ name: input.names[id], plays: n }))), tone: "neutral" });
    // Guests learn at the table, so someone coming has to know it well enough to teach it
    else if (casual && newToTable) {
      score -= CASUAL_NO_TEACHER_POINTS;
      reasons.push({ text: "Nobody coming has played it", tone: "bad" });
    }

    // Someone at the table already knows it, and newcomers have liked it before
    if (casual && game.playCount >= CASUAL_STAPLE_PLAYS) {
      score += 1;
      reasons.push({ text: `Played ${game.playCount} times at ${at}`, tone: "good" });
    }

    out.push({ game, score: Math.round(score * 10) / 10, reasons });
  }

  return out.sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name));
}

function fitsPlayerCount(g: NightGame, n: number) {
  return (g.minPlayers === null || g.minPlayers <= n) && (g.maxPlayers === null || g.maxPlayers >= n);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function list(names: string[]) {
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** "Sam rates it 9 on BGG", or for several, "Rated highly on BGG by Sam (9) & Alex (8.5)" */
function bggReason(people: { name: string; rating: string }[], how: "highly" | "low") {
  if (people.length === 1) return `${people[0].name} rates it ${people[0].rating} on BGG`;
  return `Rated ${how} on BGG by ${list(people.map((p) => `${p.name} (${p.rating})`))}`;
}

/** "Alex knows it: 12 plays on BGG", or for several, "Alex & Sam know it from BGG" */
function knowsIt(people: { name: string; plays: number }[]) {
  if (people.length === 1) return `${people[0].name} knows it: ${people[0].plays} plays on BGG`;
  return `${list(people.map((p) => p.name))} know it from BGG`;
}
