/**
 * Taste profiles and fit scores. Pure, so it's easy to test and cheap to run on
 * every page load.
 *
 * 1. Every signal a member has given about a game (where they rank it, how they
 *    rated it, their own BGG rating) becomes one preference
 *    in [-1, 1], centered on that member's average so generous and harsh raters
 *    compare fairly.
 * 2. A profile is, per mechanic and category, the average preference for games that
 *    have it, shrunk toward 0 when there's little evidence, plus the weight range
 *    of the games they like.
 * 3. A game's fit for a member combines the affinities of its features with how
 *    close its weight is to what they like, as one signal (0 = no lean either way).
 *    chance.ts turns that signal into a chance the member would like the game.
 */
import type { Sentiment } from "@/db/enums";

export type GameFeatures = {
  id: number;
  name: string;
  weight: number | null;
  mechanics: string[] | null;
  categories: string[] | null;
  /** BGG's average rating, used by chance.ts */
  bggRating?: number | null;
};

export type Signal = {
  userId: string;
  gameId: number;
  /** Share of their other ranked games this one is ranked above: 1 = top, 0 = bottom */
  rankPct?: number;
  sentiment?: Sentiment | null;
  /** Their own BGG rating, 1–10. (Wanting to play a game soon isn't a signal: that's timing, not taste.) */
  bggRating?: number | null;
};

const SENTIMENT_PREF: Record<Sentiment, number> = { love: 1, like: 0.5, meh: -0.4, nope: -1 };
/** Pseudo-observations at 0 added to every feature: one game can't define a taste */
const SHRINK = 2;

/** One number per (member, game) from whatever they've told us, before centring. */
export function rawPreference(s: Signal): number | null {
  const parts: number[] = [];
  if (s.rankPct !== undefined) parts.push(2 * s.rankPct - 1);
  if (s.sentiment) parts.push(SENTIMENT_PREF[s.sentiment]);
  if (s.bggRating) parts.push(Math.max(-1, Math.min(1, (s.bggRating - 6) / 3)));
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export type Profile = {
  userId: string;
  /** Feature key ("mechanic:Worker Placement") → shrunk average centered preference */
  affinity: Map<string, { value: number; games: number }>;
  /** Weight of the games they like, if they've liked enough rated-by-weight games */
  weight: { mean: number; sd: number } | null;
  /** Games with a preference: how much this profile rests on */
  evidence: number;
  /** Centered preference per game they've played or rated */
  prefs: Map<number, number>;
  /** The same before centring, for "what they actually think of this game" */
  rawPrefs: Map<number, number>;
};

// Built once per game: a page scores each game against dozens of profiles
const keysByGame = new WeakMap<GameFeatures, string[]>();
const featureKeys = (g: GameFeatures) => {
  let keys = keysByGame.get(g);
  if (!keys) {
    keys = [...(g.mechanics ?? []).map((m) => `mechanic:${m}`), ...(g.categories ?? []).map((c) => `category:${c}`)];
    keysByGame.set(g, keys);
  }
  return keys;
};

export const featureLabel = (key: string) => key.slice(key.indexOf(":") + 1);

export function buildProfile(userId: string, signals: Signal[], games: Map<number, GameFeatures>): Profile {
  const raw = new Map<number, number>();
  for (const s of signals) {
    if (s.userId !== userId) continue;
    const p = rawPreference(s);
    if (p !== null) raw.set(s.gameId, p);
  }
  const mean = raw.size ? [...raw.values()].reduce((a, b) => a + b, 0) / raw.size : 0;
  const prefs = new Map([...raw].map(([id, p]) => [id, p - mean]));

  const sums = new Map<string, { sum: number; games: number }>();
  const liked: { weight: number; w: number }[] = [];
  for (const [gameId, pref] of prefs) {
    const g = games.get(gameId);
    if (!g) continue;
    for (const key of featureKeys(g)) {
      const e = sums.get(key) ?? { sum: 0, games: 0 };
      e.sum += pref;
      e.games++;
      sums.set(key, e);
    }
    if (g.weight && pref > 0) liked.push({ weight: g.weight, w: pref });
  }

  const affinity = new Map([...sums].map(([k, { sum, games: n }]) => [k, { value: sum / (n + SHRINK), games: n }]));

  let weight: Profile["weight"] = null;
  if (liked.length >= 2) {
    const total = liked.reduce((a, l) => a + l.w, 0);
    const m = liked.reduce((a, l) => a + l.weight * l.w, 0) / total;
    const variance = liked.reduce((a, l) => a + l.w * (l.weight - m) ** 2, 0) / total;
    weight = { mean: m, sd: Math.sqrt(variance) };
  }

  return { userId, affinity, weight, evidence: prefs.size, prefs, rawPrefs: raw };
}

export type FitReason =
  | { kind: "likes" | "dislikes"; feature: string; tone: "good" | "bad" }
  | { kind: "weight-fits" | "heavier" | "lighter"; weight: number; tone: "good" | "bad" };

/** "Sam likes Drafting" / "You like Drafting"; `who` is a name, or null for the reader. */
export function describeReason(r: FitReason, who: string | null): string {
  const you = who === null;
  switch (r.kind) {
    case "likes":
      return you ? `You like ${r.feature}` : `${who} likes ${r.feature}`;
    case "dislikes":
      return you ? `You're not keen on ${r.feature}` : `${who} isn't keen on ${r.feature}`;
    case "weight-fits":
      return `Weight ${r.weight.toFixed(1)} suits ${you ? "you" : who}`;
    case "heavier":
    case "lighter":
      return `${r.kind === "heavier" ? "Heavier" : "Lighter"} than ${you ? "you usually like" : `${who} usually likes`}`;
  }
}
export type Fit = {
  /** How much the profile leans toward the game: 0 = no lean, positive = likes its features. Unscaled; see chance.ts. */
  signal: number;
  reasons: FitReason[];
  /** 0–1: how much of the game the profile knows about */
  confidence: number;
};

/** Within about one spread of their usual weight is good; far outside is bad */
function weightScoreOf(profile: Profile, g: GameFeatures) {
  if (!profile.weight || !g.weight) return 0;
  const tolerance = Math.max(0.5, profile.weight.sd * 1.5);
  return 1 - Math.min(2, Math.abs(g.weight - profile.weight.mean) / tolerance);
}

const signalOf = (featureScore: number, weightScore: number) => 0.75 * featureScore + 0.25 * weightScore * 0.5;

/**
 * fit's signal alone. The chance model averages it over dozens of profiles per game, so it
 * skips the reasons and the arrays fit builds.
 */
export function fitSignal(profile: Profile, g: GameFeatures): number {
  let sum = 0;
  let known = 0;
  for (const k of featureKeys(g)) {
    const a = profile.affinity.get(k);
    if (a) {
      sum += a.value;
      known++;
    }
  }
  return signalOf(known ? sum / Math.sqrt(known) : 0, weightScoreOf(profile, g));
}

export function fit(profile: Profile, g: GameFeatures): Fit {
  const keys = featureKeys(g);
  const known = keys.map((k) => [k, profile.affinity.get(k)] as const).filter((e): e is [string, { value: number; games: number }] => !!e[1]);
  const featureScore = known.length ? known.reduce((a, [, v]) => a + v.value, 0) / Math.sqrt(known.length) : 0;
  const weightScore = weightScoreOf(profile, g);
  const signal = signalOf(featureScore, weightScore);

  const reasons: FitReason[] = [];
  const sorted = [...known].sort((a, b) => b[1].value - a[1].value);
  for (const [k, v] of sorted.slice(0, 2)) if (v.value > 0.08) reasons.push({ kind: "likes", feature: featureLabel(k), tone: "good" });
  for (const [k, v] of sorted.slice(-1)) if (v.value < -0.08) reasons.push({ kind: "dislikes", feature: featureLabel(k), tone: "bad" });
  if (profile.weight && g.weight) {
    if (weightScore > 0.4) reasons.push({ kind: "weight-fits", weight: g.weight, tone: "good" });
    else if (weightScore < -0.4) reasons.push({ kind: g.weight > profile.weight.mean ? "heavier" : "lighter", weight: g.weight, tone: "bad" });
  }

  // BGG uses some names as both a mechanic and a category ("Deduction")
  const unique = reasons.filter((r, i) => reasons.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i);
  return { signal, reasons: unique, confidence: keys.length ? known.length / keys.length : 0 };
}

/** Pearson correlation of two members' preferences over games both have an opinion on. */
export function similarity(a: Profile, b: Profile): { r: number; shared: number } | null {
  const shared = [...a.prefs.keys()].filter((id) => b.prefs.has(id));
  if (shared.length < 3) return null;
  const xs = shared.map((id) => a.prefs.get(id)!);
  const ys = shared.map((id) => b.prefs.get(id)!);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (!dx || !dy) return null;
  return { r: num / Math.sqrt(dx * dy), shared: shared.length };
}

export type FeatureConsensus = { key: string; label: string; kind: "mechanic" | "category"; values: Record<string, number>; min: number; max: number; mean: number };

/**
 * Features enough of the group has evidence on, with each member's affinity:
 * shared likes have a positive minimum, shared dislikes a negative maximum, and
 * divisive ones a wide gap between the keenest and the least keen.
 */
export function featureConsensus(profiles: Profile[], minGames = 2): FeatureConsensus[] {
  const keys = new Set(profiles.flatMap((p) => [...p.affinity.keys()]));
  const out: FeatureConsensus[] = [];
  for (const key of keys) {
    const values: Record<string, number> = {};
    for (const p of profiles) {
      const a = p.affinity.get(key);
      if (a && a.games >= minGames) values[p.userId] = a.value;
    }
    const vs = Object.values(values);
    // Needs most of the group to have an opinion to say anything about the group
    if (vs.length < Math.max(2, Math.ceil(profiles.length * 0.6))) continue;
    out.push({
      key,
      label: featureLabel(key),
      kind: key.startsWith("mechanic:") ? "mechanic" : "category",
      values,
      min: Math.min(...vs),
      max: Math.max(...vs),
      mean: vs.reduce((a, b) => a + b, 0) / vs.length,
    });
  }
  return out;
}
