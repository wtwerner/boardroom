/**
 * Claude's picks on Discover. Each ask replaces the list: Claude proposes more games than
 * are shown, and the taste model keeps the ones it's most confident about.
 */

/** How many picks a list holds, for the group or for one person */
export const PICK_COUNT = { group: 8, me: 6 } as const;

/** Claude is asked for half as many again, so the weakest by the taste model can be left out */
export const askFor = (scope: keyof typeof PICK_COUNT) => Math.round(PICK_COUNT[scope] * 1.5);

/** Below this chance of a hit a pick is a coin flip, not a recommendation */
export const MIN_PICK_CHANCE = 0.6;

/**
 * Every pick from one ask is stamped with the ask's time. Picks from before that stamp
 * existed went in one by one over the minute or so an ask takes, so anything this close
 * to the newest pick counts as part of the same ask.
 */
const SAME_ASK_MS = 2 * 60 * 1000;

export const isFromLatestAsk = (pickedAt: Date, latest: Date | null) => latest !== null && pickedAt.getTime() >= latest.getTime() - SAME_ASK_MS;

/**
 * The best `count` of Claude's candidates, highest chance first. A candidate the model
 * can't score (nobody has enough ratings yet) keeps Claude's order, after the scored ones.
 */
export function choosePicks<T extends { chance: number | null }>(candidates: T[], count: number): T[] {
  return candidates
    .filter((c) => c.chance === null || c.chance >= MIN_PICK_CHANCE)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.chance ?? -1) - (a.c.chance ?? -1) || a.i - b.i)
    .slice(0, count)
    .map(({ c }) => c);
}
