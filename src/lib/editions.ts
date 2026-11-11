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
  /** BGG's reimplementation links (game.implementations), null until fetched */
  implementations: number[] | null;
  ownerIds: string[];
  plays: number;
  lastPlayed: string | null;
  sentiments: { userId: string }[];
  wantToPlay: string[];
  mustPlay: string[];
};

/**
 * Which games are editions of one another: BGG links them as reimplementations (either one
 * listing the other is enough) and they have the same name. The link alone isn't enough, since
 * BGG files new games built on an old one there too (Citadels Duel, Masters Gallery for
 * Modern Art), and the name alone could join two unrelated games. Each game maps to the
 * lowest id of its editions.
 */
export function editionGroups(games: { id: number; name: string; implementations: number[] | null }[]): Map<number, number> {
  const root = new Map(games.map((g) => [g.id, g.id]));
  const find = (id: number): number => (root.get(id) === id ? id : find(root.get(id)!));
  const title = new Map(games.map((g) => [g.id, normalizeTitle(g.name)]));
  for (const g of games) {
    for (const other of g.implementations ?? []) {
      if (!root.has(other) || title.get(other) !== title.get(g.id)) continue;
      const [a, b] = [find(g.id), find(other)];
      if (a !== b) root.set(Math.max(a, b), Math.min(a, b));
    }
  }
  return new Map(games.map((g) => [g.id, find(g.id)]));
}

/**
 * One shelf entry per game, whatever edition people own (editionGroups): everyone's copies,
 * every edition's plays and everyone's opinions. The entry is the edition the group has played
 * most (then the one most people own), so it links to where the plays are. Someone with
 * opinions on two editions keeps the ones on that edition.
 */
export function mergeEditions<T extends ShelfGame>(games: T[]): T[] {
  const group = editionGroups(games);
  const editionsOf = new Map<number, T[]>();
  for (const g of games) editionsOf.set(group.get(g.id)!, [...(editionsOf.get(group.get(g.id)!) ?? []), g]);
  return games.flatMap((g) => {
    const editions = editionsOf.get(group.get(g.id)!)!;
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
