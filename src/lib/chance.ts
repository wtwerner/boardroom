/**
 * Taste as a chance you can read: "70%" means that games scored like this one end
 * up above that member's own average about 70 times in 100.
 *
 * 1. Each game a member has rated or ranked is scored by a taste profile built
 *    without it (leave-one-out), so the model is judged on games it hasn't seen.
 * 2. A logistic regression learns how those scores, and BGG's rating, line up with
 *    whether the member put each game above or below their own average.
 * 3. It's fitted twice, with partial pooling: first on everyone's games together
 *    (how far can a taste score be trusted at all?), then per member, starting from
 *    the group's answer and moving away only as far as their own games justify. So
 *    someone with five ratings borrows the group's experience, and someone with
 *    forty gets a model of their own (if BGG's rating says nothing about their
 *    taste, it stops counting for them).
 * 4. It's Bayesian: each prediction is averaged over how unsure the fit still is,
 *    so with little evidence a chance stays near 50% instead of claiming more than
 *    the data shows. The taste profile already shrinks thin evidence toward
 *    "no lean", and the signal is kept on one scale for everyone so that carries
 *    through.
 *
 * For the group, the number is the average of the members' chances.
 */
import { type GameFeatures, type Profile, type Signal, buildProfile, fitSignal } from "./taste";

/** BGG ratings are standardised around a typical well-loved game */
const BGG_CENTER = 7.3;
const BGG_SCALE = 0.6;
/** Prior on the group's coefficients: normal with standard deviation ½ on standardised inputs, since a few games each can't pin them down */
const GROUP_PRECISION = 4;
/** How far one member's coefficients may stray from the group's: standard deviation ½ */
const MEMBER_PRECISION = 4;
const MAX_ITERATIONS = 50;

export type ChanceModel = {
  coef: number[];
  /** posterior covariance of coef */
  cov: number[][];
  /** spread of the taste signal across the group's games, to standardise it */
  scale: number;
  /** games it learned from */
  trained: number;
  /**
   * The member's profile without each of their games in turn. New games are scored
   * by the average of these, so they're judged on the same footing as the games the
   * model learned from (a profile with one game fewer is a little less sure).
   */
  profiles: Profile[];
};

/** What a member has actually said, as a training label: above their average (1), below (0) or right on it (½). */
export const knownChance = (centeredPref: number) => (centeredPref > 0 ? 1 : centeredPref < 0 ? 0 : 0.5);

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** How steeply saidChance rises: a preference half a point above someone's average comes out near 88% */
const SAID_SLOPE = 4;

/**
 * The chance of a hit from what a member has said, for showing and ranking games. One rating
 * is noisy, so a game just above their average isn't a sure hit: a "love" well above it comes
 * out near 90%, one right on it at 50%, a "nope" near 0%.
 */
export const saidChance = (centeredPref: number) => sigmoid(SAID_SLOPE * centeredPref);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const inputs = (signal: number, scale: number, g: GameFeatures) => [1, signal / scale, g.bggRating ? (g.bggRating - BGG_CENTER) / BGG_SCALE : 0];

type Row = { x: number[]; y: number };

/** Each member's rated games, each scored by a profile that hasn't seen it. */
function leaveOneOut(userId: string, signals: Signal[], games: Map<number, GameFeatures>) {
  const own = signals.filter((s) => s.userId === userId);
  const profile = buildProfile(userId, own, games);
  const rows: { signal: number; g: GameFeatures; y: number }[] = [];
  const profiles: Profile[] = [];
  for (const [gameId, pref] of profile.prefs) {
    const g = games.get(gameId);
    if (!g) continue;
    const without = buildProfile(
      userId,
      own.filter((s) => s.gameId !== gameId),
      games,
    );
    profiles.push(without);
    rows.push({ signal: fitSignal(without, g), g, y: knownChance(pref) });
  }
  return { rows, profiles };
}

/** A chance model per member, partially pooled across the group. */
export function trainChances(userIds: string[], signals: Signal[], games: Map<number, GameFeatures>): Map<string, ChanceModel> {
  const raw = new Map(userIds.map((id) => [id, leaveOneOut(id, signals, games)]));
  const all = [...raw.values()].flatMap((r) => r.rows);
  // Scaled but not centered, so a signal of 0 still means "no lean"
  const scale = Math.max(0.05, Math.sqrt(all.reduce((s, r) => s + r.signal ** 2, 0) / Math.max(1, all.length)));
  const rows = new Map([...raw].map(([id, r]) => [id, r.rows.map((row): Row => ({ x: inputs(row.signal, scale, row.g), y: row.y }))]));

  const k = 3;
  const identity = (v: number) => Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? v : 0)));
  const group = fitLogistic([...rows.values()].flat(), new Array<number>(k).fill(0), identity(GROUP_PRECISION));
  // A member's prior: the group's estimate, its uncertainty plus how far members differ
  const memberPrior = invert(group.cov.map((row, i) => row.map((v, j) => v + (i === j ? 1 / MEMBER_PRECISION : 0))));

  return new Map(
    userIds.map((id) => {
      const own = rows.get(id)!;
      return [id, { ...fitLogistic(own, group.coef, memberPrior), scale, trained: own.length, profiles: raw.get(id)!.profiles }];
    }),
  );
}

/** The chance a member would put `g` (a game they haven't rated) above their own average. */
export function chanceOf(model: ChanceModel, g: GameFeatures) {
  const signal = model.profiles.length ? model.profiles.reduce((s, p) => s + fitSignal(p, g), 0) / model.profiles.length : 0;
  const x = inputs(signal, model.scale, g);
  const mean = dot(model.coef, x);
  const variance = dot(x, model.cov.map((row) => dot(row, x)));
  // The probit approximation to averaging the sigmoid over the coefficients' uncertainty
  return sigmoid(mean / Math.sqrt(1 + (Math.PI * variance) / 8));
}

/**
 * Maximum a posteriori logistic regression under a Gaussian prior, by Newton's
 * method; returns the Laplace approximation's covariance too.
 */
function fitLogistic(rows: Row[], priorMean: number[], priorPrecision: number[][]) {
  const k = priorMean.length;
  let coef = [...priorMean];
  const curvature = (b: number[]) => {
    const hessian = priorPrecision.map((row) => [...row]);
    const offset = b.map((v, i) => v - priorMean[i]);
    const gradient = priorPrecision.map((row) => -dot(row, offset));
    for (const { x, y } of rows) {
      const p = sigmoid(dot(b, x));
      for (let i = 0; i < k; i++) {
        gradient[i] += (y - p) * x[i];
        for (let j = 0; j < k; j++) hessian[i][j] += p * (1 - p) * x[i] * x[j];
      }
    }
    return { hessian, gradient };
  };
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { hessian, gradient } = curvature(coef);
    const inverse = invert(hessian);
    const step = inverse.map((row) => dot(row, gradient));
    coef = coef.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { coef, cov: invert(curvature(coef).hessian) };
}

/** Gauss–Jordan inverse of a small positive-definite matrix. */
function invert(m: number[][]) {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    for (let c = 0; c < 2 * n; c++) a[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row) => row.slice(n));
}

export type GroupChance = {
  /** the average of the members' chances: the share of the group you'd expect to like it */
  chance: number;
  of: number;
};

/**
 * Just the average, so the group's number can be checked against the members'
 * numbers and 50% means "no idea" for the group as for one person. "The chance most
 * of you like it" is sharper about disagreement, but its "no idea" point depends on
 * the group's size (31% for four people), which makes every game look a poor fit.
 */
export function groupChance(chances: number[]): GroupChance {
  if (!chances.length) return { chance: 0.5, of: 0 };
  return { chance: chances.reduce((a, b) => a + b, 0) / chances.length, of: chances.length };
}
