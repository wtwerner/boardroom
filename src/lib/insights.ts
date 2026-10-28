import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { CASUAL_NIGHT, NIGHT_NAMES } from "@/config";
import { db, schema } from "@/db";
import { MUST_PLAY_LIMIT, type Night, TIERS } from "@/db/enums";
import { inSentence } from "./text";
import { HEAVY_WEIGHT, TIER_LABEL } from "./tier";
import { getGroupRanking, getMembers, getPlays, getShelf, getTieredRankingLists } from "./queries";
import { playerRange, playtime } from "@/components/ui";

/**
 * Plain-text snapshot of the group for Claude: who's in it, what they own,
 * what they've played, and how each person feels about it.
 */
export async function buildGroupContext({ forPurchases = false, currentPicks = [] as string[] } = {}) {
  const [members, shelf, plays, lists, group, opinions, wishlist, suggestions] = await Promise.all([
    getMembers(),
    getShelf(),
    getPlays({ limit: 60 }),
    getTieredRankingLists(),
    Promise.all([getGroupRanking("heavy", 12), getGroupRanking("light", 8)]),
    db
      .select({ userId: schema.opinion.userId, sentiment: schema.opinion.sentiment, wantToPlay: schema.opinion.wantToPlay, mustPlay: schema.opinion.mustPlay, name: schema.game.name })
      .from(schema.opinion)
      .innerJoin(schema.game, eq(schema.game.id, schema.opinion.gameId)),
    db
      .selectDistinct({ name: schema.game.name })
      .from(schema.collectionItem)
      .innerJoin(schema.game, eq(schema.game.id, schema.collectionItem.gameId))
      .where(eq(schema.collectionItem.wishlist, true)),
    db.select({ name: schema.suggestion.name }).from(schema.suggestion).orderBy(desc(schema.suggestion.createdAt)),
  ]);

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  // Rankings include played games nobody owns, so look names up beyond the shelf
  const rankedIds = [...new Set([...Object.values(lists.heavy), ...Object.values(lists.light)].flat())];
  const gameName = new Map(
    (rankedIds.length
      ? await db.select({ id: schema.game.id, name: schema.game.name }).from(schema.game).where(inArray(schema.game.id, rankedIds))
      : []
    ).map((g) => [g.id, g.name]),
  );
  const lines: string[] = [];

  lines.push("## Members", ...members.map((m) => `- ${m.name}`));

  // The group's own table; the casual night's is bigger and has guests
  const seats = plays.filter((p) => p.night === "core").map((p) => p.players.length).filter(Boolean);
  if (seats.length) {
    const avg = seats.reduce((a, b) => a + b, 0) / seats.length;
    lines.push("", `Typical table: ${avg.toFixed(1)} players (range ${Math.min(...seats)}–${Math.max(...seats)}).`);
  }

  lines.push("", "## Recent plays (newest first)");
  if (CASUAL_NIGHT) {
    lines.push(
      `Most are from ${inSentence(NIGHT_NAMES.core)}, the group's planned nights. Those marked (${inSentence(NIGHT_NAMES.casual)}) are from a separate, lighter night with guests and casual players who aren't members.`,
    );
  }
  for (const p of plays) {
    const who = p.players.map((s) => s.name).join(", ");
    lines.push(`- ${p.playedOn}: ${p.name}${p.night === "casual" ? ` (${inSentence(NIGHT_NAMES.casual)})` : ""}${who ? ` — ${who}` : ""}`);
  }

  lines.push("", "## Opinions");
  for (const m of members) {
    const mine = opinions.filter((o) => o.userId === m.id);
    if (!mine.length) continue;
    const by = (pred: (o: (typeof mine)[number]) => boolean) => mine.filter(pred).map((o) => o.name).join(", ") || "—";
    lines.push(
      `${m.name}:`,
      `  loves: ${by((o) => o.sentiment === "love")}`,
      `  likes: ${by((o) => o.sentiment === "like")}`,
      `  meh: ${by((o) => o.sentiment === "meh")}`,
      `  would rather not: ${by((o) => o.sentiment === "nope")}`,
      `  MUST PLAY (one of only ${MUST_PLAY_LIMIT} scarce votes; a strong personal priority, not a group consensus): ${by((o) => o.mustPlay)}`,
      `  wants to play soon (played before or not; cleared once they play it): ${by((o) => o.wantToPlay)}`,
    );
  }

  lines.push(
    "",
    "## Personal rankings (each person's ranking of the games they've played, best first)",
    `Games are ranked in two separate lists, never against each other: ${TIER_LABEL.heavy} (BGG weight ${HEAVY_WEIGHT}+, the longer, heavier games the group plans its own nights around) and ${TIER_LABEL.light} (lighter ones). A low place in the ${TIER_LABEL.light} list says nothing about the ${TIER_LABEL.heavy}.`,
  );
  for (const [t, tier] of TIERS.entries()) {
    lines.push(`${t ? "\n" : ""}### ${TIER_LABEL[tier]}`);
    for (const [userId, ids] of Object.entries(lists[tier])) {
      lines.push(`${nameOf.get(userId)}: ${ids.map((id, i) => `${i + 1}. ${gameName.get(id) ?? `#${id}`}`).join("  ")}`);
    }
    if (group[t].length) {
      lines.push(
        `Group ranking (the average share of each person's other ${tier} games it's ranked above, 0–100, 50 = middle): ${group[t].map((g) => `${g.game.name} ${g.points}`).join(", ")}`,
      );
    }
  }

  lines.push("", "## Shared collection (owned)");
  for (const g of shelf) {
    const bits = [
      g.year,
      playerRange(g.minPlayers, g.maxPlayers),
      g.bestPlayers?.length ? `best ${g.bestPlayers.join("/")}` : null,
      playtime(g.minPlaytime, g.maxPlaytime),
      g.weight ? `weight ${g.weight.toFixed(1)}` : null,
      `${g.plays} plays`,
      `owned by ${g.ownerIds.map((id) => nameOf.get(id)).join(", ")}`,
    ].filter(Boolean);
    lines.push(`- ${g.name} (${bits.join("; ")})`);
  }

  if (forPurchases) {
    if (wishlist.length) lines.push("", "## On members' BGG wishlists", wishlist.map((w) => w.name).join(", "));
    // The list being replaced is told apart, so Claude can keep a pick that still fits best
    const keepable = new Set(currentPicks);
    const suggested = suggestions.filter((s) => !keepable.has(s.name));
    if (suggested.length) lines.push("", "## Already suggested (don't repeat)", suggested.map((s) => s.name).join(", "));
  }

  return lines.join("\n");
}

export async function buildNightContext(input: {
  night: Night;
  presentUserIds: string[];
  /** People coming who aren't members: guests and casual players */
  others: number;
  minutes: number | null;
  candidateIds: number[];
}) {
  const members = await getMembers();
  const coming = members.filter((m) => input.presentUserIds.includes(m.id)).map((m) => m.name);
  const ids = input.candidateIds.slice(0, 20);
  const candidates = ids.length
    ? await db.select({ id: schema.game.id, name: schema.game.name }).from(schema.game).where(inArray(schema.game.id, ids))
    : [];

  return [
    await buildGroupContext(),
    "",
    `## The next ${CASUAL_NIGHT ? inSentence(NIGHT_NAMES[input.night]) : "game night"}`,
    `Coming: ${coming.join(", ") || "no members"}${input.others ? `, plus ${input.others} ${input.others === 1 ? "other" : "others"} who aren't members` : ""} (${coming.length + input.others} players).`,
    `Time available: ${input.minutes ? `${input.minutes} minutes` : "open-ended"}.`,
    "Candidates (already filtered to fit the player count and time; ordered by a simple score):",
    ...ids.map((id) => candidates.find((c) => c.id === id)).filter(Boolean).map((c) => `- [${c!.id}] ${c!.name}`),
  ].join("\n");
}
