import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { pickColor } from "./meeple";
import { matchByName } from "./players";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Give a new member a player record: claim the one their invite was for, the one from imported
 * play logs that was @-mentioned with their Discord account (or, failing those, the only
 * one with their name), or start a fresh one. Two players with their name could
 * be either, so they start fresh and merge their history in. Either way they get
 * a meeple color if they don't have one (pickColor).
 */
export async function linkPlayer(userId: string, name: string, discordId: string | null, opts: { playerId?: number | null; tx?: Db } = {}) {
  const tx = opts.tx ?? db;
  const players = await tx.select().from(schema.player);
  if (players.some((p) => p.userId === userId)) return;
  const color = pickColor(players.map((p) => p.color));
  const byName = matchByName(
    players.filter((p) => !p.userId && !p.discordId),
    name,
  );
  const match =
    (opts.playerId && players.find((p) => !p.userId && p.id === opts.playerId)) ||
    (discordId && players.find((p) => !p.userId && p.discordId === discordId)) ||
    (byName && "player" in byName ? byName.player : null);

  const invitedAs = match && opts.playerId === match.id;
  if (match) {
    await tx
      .update(schema.player)
      .set({ userId, discordId: discordId ?? match.discordId, color: match.color ?? color })
      .where(eq(schema.player.id, match.id));
    if (invitedAs && match.name !== name) {
      // They were told which player they are and chose their name knowing it; old plays still match the old one
      await tx
        .update(schema.player)
        .set({ name, aliases: [...new Set([...match.aliases, match.name.toLowerCase()])].filter((a) => a !== name.toLowerCase()) })
        .where(eq(schema.player.id, match.id));
      return;
    }
    // The group may already have renamed their player ("Sam" for a handle like "sambo99"): keep that, not the Discord name
    if (match.name !== name) await tx.update(schema.user).set({ name: match.name }).where(eq(schema.user.id, userId));
  } else {
    await tx.insert(schema.player).values({ name, userId, discordId, color });
  }
}

