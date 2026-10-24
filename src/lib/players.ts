/**
 * A player is their id; a name is only what's shown. Two people can both be called Lee, so a
 * name written somewhere (a hand-written play log, a Discord name) can match
 * more than one player, and then nobody is picked for them.
 */
export type NamedPlayer = {
  id: number;
  name: string;
  /** Lowercased other names they've been written as */
  aliases: string[];
  userId?: string | null;
  /** A member's account name, which counts as one of their names */
  memberName?: string | null;
};

export type NameMatch<P> = { player: P } | { ambiguous: P[] } | null;

const key = (s: string | null | undefined) => s?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

/**
 * The player a name is, ignoring case: their name, one of their aliases or a member's account
 * name. Several players with that name are `ambiguous`, members first, then oldest first.
 */
export function matchByName<P extends NamedPlayer>(players: P[], name: string): NameMatch<P> {
  const k = key(name);
  if (!k) return null;
  const found = players.filter((p) => [p.name, p.memberName, ...p.aliases].some((n) => key(n) === k));
  if (found.length === 0) return null;
  if (found.length === 1) return { player: found[0] };
  return { ambiguous: found.sort((a, b) => Number(!a.userId) - Number(!b.userId) || a.id - b.id) };
}

/**
 * What to call each player in a list or picker: their name, and when someone else has the same
 * name, when they first played too ("Lee (since Sep 2025)", or the day when that's the same
 * month), so two Lees can be told apart.
 */
export function playerLabels(players: { id: number; name: string; firstPlayed?: string | null }[]): Map<number, string> {
  const byName = Map.groupBy(players, (p) => key(p.name));
  return new Map(
    players.map((p) => {
      const same = byName.get(key(p.name))!;
      if (same.length < 2) return [p.id, p.name];
      if (!p.firstPlayed) return [p.id, `${p.name} (no plays yet)`];
      const sameMonth = same.some((o) => o.id !== p.id && o.firstPlayed?.slice(0, 7) === p.firstPlayed!.slice(0, 7));
      return [p.id, `${p.name} (since ${since(p.firstPlayed, sameMonth)})`];
    }),
  );
}

/** "2025-09-28" as "Sep 2025", or "Sep 28, 2025" with the day */
function since(iso: string, withDay: boolean) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", ...(withDay && { day: "numeric" }), year: "numeric", timeZone: "UTC" });
}
