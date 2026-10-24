/**
 * Re-ranking from scratch with "this or that?" questions, scored as a whole rather
 * than one insertion at a time.
 *
 * Binary insertion (ranking.ts) is quick for slotting in one new game, but each
 * answer is final: one misclick or one off-day answer early on puts a game in the
 * wrong half of the list for good. A replay instead keeps every answer and fits a
 * Bradley–Terry model to all of them, so a stray answer is outvoted by the rest:
 *
 * - Each game has a strength θ; P(you pick i over j) = 1 / (1 + e^(θj − θi)).
 *   "About the same" counts as half a win each way.
 * - Every game also gets one imaginary tie against an average game. That keeps a
 *   game that won all its few questions from shooting off to infinity, and pulls
 *   games with little evidence toward the middle.
 * - The next question is the pair the model is least sure about: close in strength
 *   (an answer could go either way) and still uncertain (few answers so far). Pairs
 *   already asked, and games in the question just answered, are held back so one
 *   answer doesn't anchor the next.
 * - It starts blind: your current list isn't used to pick questions or as a prior,
 *   so the result measures what you think now, not what you thought before.
 */

export type Comparison = {
  a: number;
  b: number;
  /** a or b, or null for "about the same" */
  winner: number | null;
};

export type Strength = {
  /** log-strength; 0 is an average game */
  theta: number;
  /** standard error of theta */
  se: number;
  /** questions this game has been in */
  asked: number;
};

const PRIOR_TIES = 1;
const MAX_ITERATIONS = 500;
const TOLERANCE = 1e-9;

/** A small seeded random number generator (mulberry32), so a question picked during render is the same on every render. */
export function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Fits Bradley–Terry strengths with Hunter's MM algorithm (each step can't make the fit worse). */
export function fitStrengths(ids: number[], comparisons: Comparison[]): Map<number, Strength> {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const wins = new Array<number>(n).fill(PRIOR_TIES / 2);
  const asked = new Array<number>(n).fill(0);
  const games = new Map<string, { i: number; j: number; count: number }>();

  for (const c of comparisons) {
    const i = index.get(c.a);
    const j = index.get(c.b);
    if (i === undefined || j === undefined || i === j) continue;
    if (c.winner === null) {
      wins[i] += 0.5;
      wins[j] += 0.5;
    } else if (c.winner === c.a) wins[i] += 1;
    else if (c.winner === c.b) wins[j] += 1;
    else continue;
    asked[i]++;
    asked[j]++;
    const key = pairKey(i, j);
    const entry = games.get(key) ?? { i, j, count: 0 };
    entry.count++;
    games.set(key, entry);
  }
  const pairs = [...games.values()];

  // gamma = e^theta; the imaginary average opponent has gamma 1, which also fixes the scale
  let gamma = new Array<number>(n).fill(1);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const denom = gamma.map((g) => PRIOR_TIES / (g + 1));
    for (const { i, j, count } of pairs) {
      const d = count / (gamma[i] + gamma[j]);
      denom[i] += d;
      denom[j] += d;
    }
    const next = wins.map((w, i) => w / denom[i]);
    const change = Math.max(0, ...next.map((g, i) => Math.abs(Math.log(g) - Math.log(gamma[i]))));
    gamma = next;
    if (change < TOLERANCE) break;
  }

  // Standard errors from the Fisher information (its diagonal, which is plenty for choosing questions)
  const info = gamma.map((g) => (PRIOR_TIES * g) / (g + 1) ** 2);
  for (const { i, j, count } of pairs) {
    const p = gamma[i] / (gamma[i] + gamma[j]);
    info[i] += count * p * (1 - p);
    info[j] += count * p * (1 - p);
  }
  return new Map(ids.map((id, i) => [id, { theta: Math.log(gamma[i]), se: 1 / Math.sqrt(info[i]), asked: asked[i] }]));
}

/** P(you'd pick a over b), by the fitted strengths. */
export const preferProbability = (a: Strength, b: Strength) => 1 / (1 + Math.exp(b.theta - a.theta));

/**
 * The most informative question to ask next: p(1 − p) is highest for a coin-flip
 * pair, √(var a + var b) for games the model knows least about. A little jitter
 * stops near-equal pairs coming up in a fixed order.
 */
export function nextPair(
  ids: number[],
  comparisons: Comparison[],
  random: () => number = Math.random,
): [number, number] | null {
  if (ids.length < 2) return null;
  const strengths = fitStrengths(ids, comparisons);
  const timesAsked = new Map<string, number>();
  for (const c of comparisons) timesAsked.set(pairKey(c.a, c.b), (timesAsked.get(pairKey(c.a, c.b)) ?? 0) + 1);
  const last = comparisons.at(-1);
  const justSeen = new Set(last ? [last.a, last.b] : []);

  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (let x = 0; x < ids.length; x++) {
    for (let y = x + 1; y < ids.length; y++) {
      const a = strengths.get(ids[x])!;
      const b = strengths.get(ids[y])!;
      const p = preferProbability(a, b);
      let score = p * (1 - p) * Math.sqrt(a.se ** 2 + b.se ** 2);
      score /= (1 + (timesAsked.get(pairKey(ids[x], ids[y])) ?? 0)) ** 2;
      if (justSeen.has(ids[x]) || justSeen.has(ids[y])) score *= 0.25;
      score *= 0.9 + 0.2 * random();
      if (score > bestScore) {
        bestScore = score;
        best = [ids[x], ids[y]];
      }
    }
  }
  return best;
}

/**
 * How many questions a replay asks: about n·log₂n, what a good sort needs plus some
 * slack for answers that disagree. Small lists stop at every pair asked once.
 */
export function questionBudget(n: number) {
  if (n < 2) return 0;
  return Math.min(Math.ceil(n * Math.log2(n)), (n * (n - 1)) / 2);
}

/** Every game has been in at least two questions (or every one it can), so none is placed on the prior alone. */
export function canFinish(ids: number[], comparisons: Comparison[]) {
  if (ids.length < 2) return false;
  const need = Math.min(2, ids.length - 1);
  const strengths = fitStrengths(ids, comparisons);
  return ids.every((id) => strengths.get(id)!.asked >= need);
}

export type ReplayResult = {
  /** best first */
  order: number[];
  /** answers (not counting "about the same") whose pick ended up higher in the order */
  agreed: number;
  decided: number;
};

/** The ranking the answers add up to. Exact ties keep their order from `tieBreak` (your old list). */
export function replayResult(ids: number[], comparisons: Comparison[], tieBreak: number[] = []): ReplayResult {
  const strengths = fitStrengths(ids, comparisons);
  const before = new Map(tieBreak.map((id, i) => [id, i]));
  const order = [...ids].sort(
    (a, b) =>
      strengths.get(b)!.theta - strengths.get(a)!.theta ||
      (before.get(a) ?? Infinity) - (before.get(b) ?? Infinity) ||
      a - b,
  );
  const position = new Map(order.map((id, i) => [id, i]));
  let agreed = 0;
  let decided = 0;
  for (const c of comparisons) {
    if (c.winner === null || !position.has(c.a) || !position.has(c.b)) continue;
    const loser = c.winner === c.a ? c.b : c.a;
    decided++;
    if (position.get(c.winner)! < position.get(loser)!) agreed++;
  }
  return { order, agreed, decided };
}
