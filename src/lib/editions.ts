/**
 * Editions of one game: BGG lists Citadels (2000) and Citadels (2016) as two games, so two people's
 * copies of it can land on the shelf as two games, with a play counted against only one of them.
 * Pure, so it's tested.
 */

/** A title compared loosely: case, accents, punctuation and "&" for "and" don't matter */
export const normalizeTitle = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type ShelfGame = {
  id: number;
  name: string;
  ownerIds: string[];
  plays: number;
  lastPlayed: string | null;
  sentiments: { userId: string }[];
  wantToPlay: string[];
  mustPlay: string[];
};

/**
 * One shelf entry per title: games with the same name are editions of one game, so they're shown
 * once, with everyone's copies, every edition's plays and everyone's opinions. The entry is the
 * edition the group has played most (then the one most people own), so it links to where the
 * plays are. Someone with opinions on two editions keeps the ones on that edition.
 */
export function mergeEditions<T extends ShelfGame>(games: T[]): T[] {
  const byTitle = new Map<string, T[]>();
  for (const g of games) {
    const key = normalizeTitle(g.name);
    byTitle.set(key, [...(byTitle.get(key) ?? []), g]);
  }
  return games.flatMap((g) => {
    const editions = byTitle.get(normalizeTitle(g.name))!;
    if (editions.length === 1) return [g];
    const [main] = [...editions].sort((a, b) => b.plays - a.plays || b.ownerIds.length - a.ownerIds.length || a.id - b.id);
    if (g !== main) return [];
    const others = editions.filter((e) => e !== main);
    const union = (pick: (e: T) => string[]) => [...new Set(editions.flatMap(pick))];
    const lastPlayed = editions.map((e) => e.lastPlayed).filter((d): d is string => d !== null).sort().at(-1) ?? null;
    const rated = new Set(main.sentiments.map((s) => s.userId));
    return [
      {
        ...main,
        ownerIds: union((e) => e.ownerIds),
        plays: editions.reduce((n, e) => n + e.plays, 0),
        lastPlayed,
        sentiments: [...main.sentiments, ...others.flatMap((e) => e.sentiments).filter((s) => !rated.has(s.userId) && rated.add(s.userId))],
        wantToPlay: union((e) => e.wantToPlay),
        mustPlay: union((e) => e.mustPlay),
      },
    ];
  });
}
