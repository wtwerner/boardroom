import { HEAVY_WEIGHT } from "@/config";
import type { Night, Tier } from "@/db/enums";

/**
 * BGG weight from which a game is ranked with the heavy games (2.75 unless Group settings
 * says otherwise). Pick it where the group's own nights and its lighter games split apart.
 */
export { HEAVY_WEIGHT };

/** Named for what decides them, the game's weight, rather than for a night: any night can play either */
export const TIER_LABEL: Record<Tier, string> = { heavy: "Heavy games", light: "Light games" };

/** The short form, for the tag beside a game's name */
export const TIER_TAG: Record<Tier, string> = { heavy: "Heavy", light: "Light" };

/** The kind of game each night plays: weight is what sets the two apart */
export const NIGHT_TIER: Record<Night, Tier> = { core: "heavy", casual: "light" };

/** Which list a game is ranked in: set by hand, or else by its weight. Unknown weight counts as light. */
export function gameTier(g: { weight: number | null; tier: Tier | null }): Tier {
  return g.tier ?? (g.weight !== null && g.weight >= HEAVY_WEIGHT ? "heavy" : "light");
}

/**
 * A member's whole ranking with one tier's games put in a new order. The other tier's games
 * keep their places, and this tier's games take over the spots this tier held before, in the
 * new order; any extra go at the end. Only the order within a tier means anything, but keeping
 * the spots means a game moved to the other tier later lands near where it was.
 */
export function replaceTier(current: number[], inTier: (gameId: number) => boolean, ordered: number[]): number[] {
  const next = [...ordered];
  const merged = current.flatMap((id) => (inTier(id) ? (next.length ? [next.shift()!] : []) : [id]));
  return [...merged, ...next];
}
