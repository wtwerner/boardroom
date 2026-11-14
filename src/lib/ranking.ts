/**
 * Everyone ranks every game they've played with the group, so lists differ in
 * length. Each placement becomes the share of the other games on that list it's
 * ranked above: 1 for the top, 0 for the bottom, ½ for the middle. (A one-game list
 * says nothing about preference, so it counts as ½.) A game's group score is the
 * average share across the people who ranked it, pulled toward ½ by one imaginary
 * middling vote so a game only one person has ranked can't top the list on that
 * alone. Points are that average as a percentage: 80 means that, on average, it's
 * ranked above 80% of the other games in people's lists.
 */
const PRIOR_VOTES = 1;
const PRIOR_SCORE = 0.5;

/** The share of the other games in a list of `length` that position `position` (0 = top) is ranked above. */
export const rankShare = (position: number, length: number) => (length > 1 ? (length - 1 - position) / (length - 1) : 0.5);

export type GroupRank = {
  gameId: number;
  /** 0–100: the average share of each voter's other games it's ranked above, pulled toward 50 */
  points: number;
  /** position (0-based) in each voter's list */
  positions: Record<string, number>;
};

export function groupRanking(lists: Record<string, number[]>): GroupRank[] {
  const byGame = new Map<number, { sum: number; positions: Record<string, number> }>();
  for (const [userId, gameIds] of Object.entries(lists)) {
    gameIds.forEach((gameId, position) => {
      const entry = byGame.get(gameId) ?? { sum: 0, positions: {} };
      entry.sum += rankShare(position, gameIds.length);
      entry.positions[userId] = position;
      byGame.set(gameId, entry);
    });
  }
  return [...byGame.entries()]
    .map(([gameId, { sum, positions }]) => {
      const votes = Object.keys(positions).length;
      const score = (sum + PRIOR_SCORE * PRIOR_VOTES) / (votes + PRIOR_VOTES);
      return { gameId, points: Math.round(score * 100), positions };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        // tie-break: more people ranked it
        Object.keys(b.positions).length - Object.keys(a.positions).length ||
        a.gameId - b.gameId,
    );
}

/**
 * Each kind of night has its own group list, made from the rankings of the people who come to it.
 * Someone who's played at the casual night within this many days counts in its crowd.
 */
export const CROWD_DAYS = 365;

/** The first date (YYYY-MM-DD) a play can be on and still count someone in a night's crowd, from `today` */
export function crowdSince(today: string, days = CROWD_DAYS) {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Only the lists of the people in a night's crowd */
export function crowdLists<T>(lists: Record<string, T>, crowd: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(lists).filter(([id]) => crowd.has(id)));
}

/**
 * Binary insertion by comparison: where a new game goes in a ranked list is found
 * by asking "this or that?" against the middle of the remaining range. Pure so the
 * UI can drive it one answer at a time.
 */
export type Placement = { lo: number; hi: number };

export const startPlacement = (listLength: number): Placement => ({ lo: 0, hi: listLength });

/** The index of the ranked game to compare against, or null when the spot is found (at `lo`). */
export const compareIndex = ({ lo, hi }: Placement) => (lo < hi ? Math.floor((lo + hi) / 2) : null);

export function answer(p: Placement, prefersNew: boolean | "same"): Placement {
  const mid = compareIndex(p);
  if (mid === null) return p;
  // "About the same" settles it: right after the game it was compared with
  if (prefersNew === "same") return { lo: mid + 1, hi: mid + 1 };
  return prefersNew ? { lo: p.lo, hi: mid } : { lo: mid + 1, hi: p.hi };
}

/** Someone's own BGG ratings this far apart settle a "which would you rather play?" without asking */
export const CLEAR_BGG_GAP = 2;

/** True when the new game wins on BGG ratings, false when the other one does, null when it's close or one isn't rated */
export function clearPick(newRating: number | null | undefined, otherRating: number | null | undefined): boolean | null {
  if (newRating == null || otherRating == null || Math.abs(newRating - otherRating) < CLEAR_BGG_GAP) return null;
  return newRating > otherRating;
}

/** A ranking being built: the list so far, the games still to place (first is being placed now), and where it could go */
export type Placing = { ids: number[]; queue: number[]; placement: Placement };

/**
 * Answers every question the person's BGG ratings settle (clearPick), placing games as their
 * spots are found, and stops at the first one that needs asking. `answered` is how many it settled.
 */
export function settleClearCalls(s: Placing, rating: (id: number) => number | null | undefined): Placing & { answered: number } {
  let { ids, queue, placement } = s;
  let answered = 0;
  while (queue.length) {
    const [id, next] = queue;
    if (ids.length === 0) {
      // Starting from nothing: the first question is between two of the games to place
      const pick = next === undefined ? null : clearPick(rating(id), rating(next));
      if (pick === null) break;
      ids = pick ? [id, next] : [next, id];
      queue = queue.slice(2);
      placement = startPlacement(ids.length);
      answered++;
      continue;
    }
    const mid = compareIndex(placement);
    const pick = mid === null ? null : clearPick(rating(id), rating(ids[mid]));
    if (pick === null) break;
    placement = answer(placement, pick);
    answered++;
    if (compareIndex(placement) === null) {
      ids = [...ids.slice(0, placement.lo), id, ...ids.slice(placement.lo)];
      queue = queue.slice(1);
      placement = startPlacement(ids.length);
    }
  }
  return { ids, queue, placement, answered };
}
