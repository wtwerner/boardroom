import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NIGHT_TITLES, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import type { Night, RsvpStatus } from "@/db/enums";
import { retitle } from "./night-title";
import { matchByName } from "./players";
import { getKnownPlayers } from "./events";
import { fillSeats, nextAnswer } from "./rsvp";

/**
 * Writes for the nights Boardroom runs, shared by the site's actions and the Discord handlers
 * so a night made or answered in either place ends up the same. Errors are plain sentences,
 * shown to people as they are.
 */

const GRACE_MS = 12 * 3_600_000;

/** A night, as stored */
export async function ownNight(id: number) {
  const n = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, id) });
  if (!n) throw new Error("That's gone: it was deleted.");
  return n;
}

export type NightFields = {
  night: Night;
  title: string;
  startsAt: Date;
  location: string | null;
  /** Seats; null for no limit */
  capacity?: number | null;
};

const dateOf = (at: Date) => at.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/**
 * A new night. Whoever made it answers on its post like everyone else: making a night for the
 * group doesn't always mean going. Its post goes up after (night-post.ts).
 */
export async function createNight(fields: NightFields, createdBy: string) {
  const [row] = await db
    .insert(schema.gameNight)
    .values({ ...fields, location: fields.location || null, date: dateOf(fields.startsAt), createdBy })
    .returning();
  return row;
}

const isPast = (n: { startsAt: Date }) => n.startsAt.getTime() < Date.now() - GRACE_MS;

/** Change a night's details. Returns how it was, so the thread can be told what moved. */
export async function editNight(id: number, fields: Partial<NightFields>) {
  const n = await ownNight(id);
  if (n.cancelled) throw new Error("That was cancelled.");
  const next = {
    ...fields,
    // A night that moves gets its reminder and morning-after nudge again, for the new time
    ...(fields.startsAt ? { date: dateOf(fields.startsAt) } : {}),
    ...(fields.startsAt && fields.startsAt.getTime() !== n.startsAt.getTime() ? { remindedAt: null, logNudgedAt: null } : {}),
    ...(fields.location !== undefined ? { location: fields.location || null } : {}),
  };
  await db.transaction(async (tx) => {
    await tx.update(schema.gameNight).set(next).where(eq(schema.gameNight.id, n.id));
    // Its games follow it, so a play on the new kind of night still completes them
    if (fields.night && fields.night !== n.night) await tx.update(schema.gamePlan).set({ night: fields.night }).where(eq(schema.gamePlan.gameNightId, n.id));
  });
  return n;
}

/**
 * A night named by the group's template follows the game locked in for it ("10/29 Game Night —
 * TBD" becomes "10/29 Game Night — Root", and back to TBD when it's unlocked). A title named
 * by hand stays. Returns whether it changed.
 */
export async function titleForGame(nightId: number) {
  const n = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { title: true, startsAt: true, night: true } });
  if (!n) return false;
  const [chosen] = await db
    .select({ name: schema.game.name })
    .from(schema.gamePlan)
    .innerJoin(schema.game, eq(schema.game.id, schema.gamePlan.gameId))
    .where(and(eq(schema.gamePlan.gameNightId, nightId), eq(schema.gamePlan.chosen, true)));
  const title = retitle(n.title, NIGHT_TITLES[n.night], dateOf(n.startsAt), chosen?.name ?? null);
  if (title === n.title) return false;
  await db.update(schema.gameNight).set({ title }).where(eq(schema.gameNight.id, nightId));
  return true;
}

/**
 * A night that went back to finding a date (poll-store.ts), back on the date picked for it.
 * Its games, votes and prep were kept for this; its reminder and morning-after nudge start over.
 */
export async function reviveNight(id: number, fields: { title: string; startsAt: Date; location: string | null }) {
  const [row] = await db
    .update(schema.gameNight)
    .set({ ...fields, location: fields.location || null, date: dateOf(fields.startsAt), cancelled: false, remindedAt: null, logNudgedAt: null })
    .where(eq(schema.gameNight.id, id))
    .returning();
  if (!row) throw new Error("That's gone: it was deleted.");
  // Named by the template, its title follows the game locked in for it
  await titleForGame(row.id);
  return ownNight(row.id);
}

/**
 * Who's waiting for a seat at a night with a seat limit, by player: taken before a change that
 * could open one (an answer, the seats, the others counted by hand), so whoever got one can be
 * told (night-post.ts)
 */
export async function waitingFor(nightId: number) {
  const n = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { capacity: true, guests: true } });
  if (!n?.capacity) return [];
  const going = await db
    .select({ playerId: schema.nightRsvp.playerId, guests: schema.nightRsvp.guests })
    .from(schema.nightRsvp)
    .where(and(eq(schema.nightRsvp.gameNightId, nightId), eq(schema.nightRsvp.status, "going")))
    .orderBy(schema.nightRsvp.respondedAt);
  return fillSeats(going, n.capacity, n.guests).waitlist.map((a) => a.playerId);
}

/** Called off: it stays (so its post can say so) but leaves the list of nights */
export async function cancelNight(id: number) {
  const n = await ownNight(id);
  await db.update(schema.gameNight).set({ cancelled: true }).where(eq(schema.gameNight.id, n.id));
  return n;
}

/** Gone entirely, with the games planned for it. Returns it, so its post can be taken down too. */
export async function deleteNight(id: number) {
  const n = await ownNight(id);
  await db.transaction(async (tx) => {
    const plans = tx.select({ id: schema.gamePlan.id }).from(schema.gamePlan).where(eq(schema.gamePlan.gameNightId, n.id));
    await tx.delete(schema.planVote).where(inArray(schema.planVote.planId, plans));
    await tx.delete(schema.planReady).where(inArray(schema.planReady.planId, plans));
    await tx.delete(schema.gamePlan).where(eq(schema.gamePlan.gameNightId, n.id));
    await tx.delete(schema.nightRsvp).where(eq(schema.nightRsvp.gameNightId, n.id));
    await tx.delete(schema.gameNight).where(eq(schema.gameNight.id, n.id));
  });
  return n;
}

/**
 * Someone's answer for a night, or none (`status` null) to take it back. Guests are kept
 * when only the status changes.
 */
export async function setRsvp(input: { nightId: number; playerId: number; status: RsvpStatus | null; guests?: number; via: "site" | "discord" }) {
  const n = await ownNight(input.nightId);
  if (n.cancelled) throw new Error("That was cancelled.");
  if (isPast(n)) throw new Error("That's been and gone.");
  const key = and(eq(schema.nightRsvp.gameNightId, n.id), eq(schema.nightRsvp.playerId, input.playerId));
  if (!input.status) {
    await db.delete(schema.nightRsvp).where(key);
    return n;
  }
  const current = await db.query.nightRsvp.findFirst({ where: key });
  const answer = nextAnswer(current ?? null, input.status, input.guests);
  // Only a change of status moves someone in the list; adding a guest doesn't
  const respondedAt = current && current.status === answer.status ? current.respondedAt : new Date();
  await db
    .insert(schema.nightRsvp)
    .values({ gameNightId: n.id, playerId: input.playerId, ...answer, via: input.via, respondedAt })
    .onConflictDoUpdate({ target: [schema.nightRsvp.gameNightId, schema.nightRsvp.playerId], set: { ...answer, via: input.via, respondedAt } });
  return n;
}

/**
 * The player for someone using the bot: by their Discord id, a member's account with that id,
 * or someone named on the site before they were in Discord (a player with that name and no
 * Discord or account yet), or else a new player with the name the server shows for them. Like
 * the play import does for @-mentions, so their answers and their plays are the same person.
 */
/**
 * Someone asked to bring a game answers: yes puts it under their name, no takes it off the list.
 * Null when the ask isn't theirs to answer anymore (someone else is bringing it, or it's gone).
 */
export async function answerBringAsk(planId: number, userId: string, yes: boolean) {
  const [plan] = await db
    .select({ askedId: schema.gamePlan.askedId, nightId: schema.gamePlan.gameNightId, game: schema.game.name, night: schema.gameNight.title })
    .from(schema.gamePlan)
    .innerJoin(schema.game, eq(schema.game.id, schema.gamePlan.gameId))
    .innerJoin(schema.gameNight, eq(schema.gameNight.id, schema.gamePlan.gameNightId))
    .where(eq(schema.gamePlan.id, planId));
  if (!plan || plan.askedId !== userId) return null;
  if (yes) {
    await db.update(schema.gamePlan).set({ bringerId: userId, askedId: null }).where(eq(schema.gamePlan.id, planId));
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(schema.planVote).where(eq(schema.planVote.planId, planId));
      await tx.delete(schema.planReady).where(eq(schema.planReady.planId, planId));
      await tx.delete(schema.gamePlan).where(eq(schema.gamePlan.id, planId));
    });
  }
  return { nightId: plan.nightId!, game: plan.game, night: plan.night };
}

export async function playerForDiscordUser(discordId: string, name: string) {
  const byDiscord = await db.query.player.findFirst({ where: eq(schema.player.discordId, discordId) });
  if (byDiscord) return byDiscord;
  const member = await db.query.user.findFirst({ where: eq(schema.user.discordId, discordId), columns: { id: true } });
  if (member) {
    const own = await db.query.player.findFirst({ where: eq(schema.player.userId, member.id) });
    if (own) {
      await db.update(schema.player).set({ discordId }).where(eq(schema.player.id, own.id));
      return { ...own, discordId };
    }
  }
  const unclaimed = await db.select().from(schema.player).where(and(isNull(schema.player.discordId), isNull(schema.player.userId)));
  // Only the one player with their name: of two, either could be them
  const named = matchByName(unclaimed, name);
  if (named && "player" in named) {
    const claimed = { discordId, userId: member?.id ?? null };
    await db.update(schema.player).set(claimed).where(eq(schema.player.id, named.player.id));
    return { ...named.player, ...claimed };
  }
  const [created] = await db.insert(schema.player).values({ name: name.trim().slice(0, 40) || "Someone", discordId, userId: member?.id ?? null }).returning();
  return created;
}

/**
 * Someone named on the site, who may not be in Discord or have an account yet: the one player
 * with that name or alias (a member's account name counts too), or a new one. `isNew` when
 * whoever named them said it's someone new, though a player has the name already. Signing in,
 * the bot's buttons and the play import all find them by name later.
 */
export async function playerNamed(rawName: string, opts: { isNew?: boolean } = {}) {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw new Error("Give their name.");
  if (!opts.isNew) {
    const match = matchByName(await getKnownPlayers(), name);
    if (match && "ambiguous" in match) throw new Error(`${match.ambiguous.length} players are called ${name}. Pick which one from the list on the site.`);
    if (match) return match.player.id;
  }
  const [created] = await db.insert(schema.player).values({ name }).returning({ id: schema.player.id });
  return created.id;
}

/** The signed-in member's player, made if they somehow have none */
export async function playerForUser(user: { id: string; name: string; playerId: number | null }) {
  if (user.playerId) return user.playerId;
  const existing = await db.query.player.findFirst({ where: eq(schema.player.userId, user.id), columns: { id: true } });
  if (existing) return existing.id;
  const [created] = await db.insert(schema.player).values({ name: user.name, userId: user.id }).returning({ id: schema.player.id });
  return created.id;
}
