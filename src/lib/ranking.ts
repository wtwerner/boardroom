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
