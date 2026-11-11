import { MEEPLE_COLORS, type MeepleColor } from "@/db/enums";

/**
 * A color for someone new: one of the least used, so a group's colors stay spread out, picked at
 * random among those so it isn't always red. Colors repeat once everyone's has been used.
 */
export function pickColor(used: (MeepleColor | null)[], random = Math.random): MeepleColor {
  const counts = new Map<MeepleColor, number>(MEEPLE_COLORS.map((c) => [c, 0]));
  for (const c of used) if (c && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  const fewest = Math.min(...counts.values());
  const choices = MEEPLE_COLORS.filter((c) => counts.get(c) === fewest);
  return choices[Math.floor(random() * choices.length)];
}

/**
 * A row with something for each person (their chance on Discover, say) stays short in a big crowd:
 * everyone while they fit in `max`, or else the best `max - 1` by `score`, and the rest to count.
 */
export function topFew<T>(people: T[], score: (p: T) => number, max = 6): { shown: T[]; rest: T[] } {
  if (people.length <= max) return { shown: people, rest: [] };
  const ranked = [...people].sort((a, b) => score(b) - score(a));
  return { shown: ranked.slice(0, max - 1), rest: ranked.slice(max - 1) };
}
