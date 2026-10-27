import "server-only";
import { and, asc, desc, eq, exists, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Night } from "@/db/enums";
import { type Attendee, groupAnswers } from "./rsvp";

/** A night stays upcoming until this long after it starts, so it's still there on the night */
const GRACE_MS = 12 * 3_600_000;

const { game } = schema;

export type PlannedGame = Awaited<ReturnType<typeof loadNights>>[number]["games"][number];
export type NightDetail = Awaited<ReturnType<typeof loadNights>>[number];

async function loadNights(nights: (typeof schema.gameNight.$inferSelect)[]) {
  if (nights.length === 0) return [];
  const ids = nights.map((n) => n.id);
  const [plans, rsvps] = await Promise.all([
    db
      .select({
        id: schema.gamePlan.id,
        gameNightId: schema.gamePlan.gameNightId,
        chosen: schema.gamePlan.chosen,
        bringerId: schema.gamePlan.bringerId,
        askedId: schema.gamePlan.askedId,
        createdBy: schema.gamePlan.createdBy,
        links: schema.gamePlan.links,
        playedAt: schema.gamePlan.playedAt,
        game: {
          id: game.id,
          name: game.name,
          thumbnail: game.thumbnail,
          minPlayers: game.minPlayers,
          maxPlayers: game.maxPlayers,
          minPlaytime: game.minPlaytime,
          maxPlaytime: game.maxPlaytime,
          weight: game.weight,
        },
      })
      .from(schema.gamePlan)
      .innerJoin(game, eq(game.id, schema.gamePlan.gameId))
      .where(inArray(schema.gamePlan.gameNightId, ids))
      .orderBy(asc(schema.gamePlan.id)),
    db
      .select({
        gameNightId: schema.nightRsvp.gameNightId,
        playerId: schema.nightRsvp.playerId,
        status: schema.nightRsvp.status,
        guests: schema.nightRsvp.guests,
        respondedAt: schema.nightRsvp.respondedAt,
        name: schema.player.name,
        userId: schema.player.userId,
        discordId: schema.player.discordId,
      })
      .from(schema.nightRsvp)
      .innerJoin(schema.player, eq(schema.player.id, schema.nightRsvp.playerId))
      .where(inArray(schema.nightRsvp.gameNightId, ids)),
  ]);
  const played = await getNightPlays(nights);
  const planIds = plans.map((p) => p.id);
  const [votes, ready] = planIds.length
    ? await Promise.all([
        db.select().from(schema.planVote).where(inArray(schema.planVote.planId, planIds)),
        db.select().from(schema.planReady).where(inArray(schema.planReady.planId, planIds)),
      ])
    : [[], []];

  return nights.map((n) => {
    const answers = groupAnswers(rsvps.filter((r) => r.gameNightId === n.id));
    const attendee = (r: (typeof rsvps)[number]): Attendee => ({ name: r.name, playerId: r.playerId, userId: r.userId, guests: r.guests, discordId: r.discordId });
    const going = answers.going.map(attendee);
    return {
      id: n.id,
      night: n.night,
      title: n.title,
      startsAt: n.startsAt.toISOString(),
      location: n.location,
      /** Its post in Discord */
      url: n.url,
      /** Boardroom posted it to the events channel, with its own thread */
      posted: n.messageId !== null,
      /** Made from logged plays: its start time is a guess, so it isn't shown */
      fromPlays: n.createdBy === null,
      capacity: n.capacity,
      /** Everyone coming who isn't named: people's guests, and others counted by hand */
      guests: n.guests + going.reduce((sum, a) => sum + (a.guests ?? 0), 0),
      /** Others coming, counted by hand on the night's page */
      othersComing: n.guests,
      cancelled: n.cancelled,
      going,
      maybe: answers.maybe.map(attendee),
      declined: answers.declined.map(attendee),
      waitlist: answers.waitlist.map(attendee),
      date: n.date,
      past: n.startsAt.getTime() < Date.now() - GRACE_MS,
      plays: played.filter((p) => p.night === n.night && p.playedOn === n.date),
      games: plans
        .filter((p) => p.gameNightId === n.id)
        .map((p) => ({
          ...p,
          playedAt: p.playedAt?.toISOString() ?? null,
          votes: votes.filter((v) => v.planId === p.id).map((v) => v.userId),
          readyUserIds: ready.filter((r) => r.planId === p.id).map((r) => r.userId),
        })),
    };
  });
}

export function getKnownPlayers() {
  return db
    .select({
      id: schema.player.id,
      name: schema.player.name,
      aliases: schema.player.aliases,
      userId: schema.player.userId,
      memberName: schema.user.name,
    })
    .from(schema.player)
    .leftJoin(schema.user, eq(schema.user.id, schema.player.userId));
}

/** Every night that hasn't happened yet, both kinds, soonest first */
export async function getUpcomingNights() {
  const rows = await db
    .select()
    .from(schema.gameNight)
    .where(and(eq(schema.gameNight.cancelled, false), gte(schema.gameNight.startsAt, new Date(Date.now() - GRACE_MS))))
    .orderBy(asc(schema.gameNight.startsAt));
  return loadNights(rows);
}

/** One night, past or upcoming */
export async function loadNight(id: number) {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, id) });
  return row ? ((await loadNights([row]))[0] ?? null) : null;
}

/** What was played on these nights: plays on each one's date and kind of night, with who played */
async function getNightPlays(nights: { night: Night; date: string | null }[]) {
  const keys = nights.filter((n) => n.date);
  if (keys.length === 0) return [];
  const rows = await db
    .select({ id: schema.play.id, night: schema.play.night, playedOn: schema.play.playedOn, gameId: schema.play.gameId, gameName: schema.play.gameName, location: schema.play.location, title: game.name, thumbnail: game.thumbnail, image: game.image })
    .from(schema.play)
    .leftJoin(game, eq(game.id, schema.play.gameId))
    .where(or(...keys.map((n) => and(eq(schema.play.night, n.night), eq(schema.play.playedOn, n.date!)))))
    .orderBy(asc(schema.play.id));
  const seats = rows.length
    ? await db
        .select({ playId: schema.playPlayer.playId, playerId: schema.player.id, name: schema.player.name, color: schema.player.color, userId: schema.player.userId })
        .from(schema.playPlayer)
        .innerJoin(schema.player, eq(schema.player.id, schema.playPlayer.playerId))
        .where(inArray(schema.playPlayer.playId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => ({ ...r, name: r.title ?? r.gameName, players: seats.filter((s) => s.playId === r.id) }));
}

/**
 * Nights that have happened, newest first: ones with plays logged, or that were planned
 * (with answers or games on them). A night made from plays that later moved to another
 * date has nothing to show, so it's left out.
 */
export async function getPastNights(limit: number) {
  const n = schema.gameNight;
  const rows = await db
    .select()
    .from(n)
    .where(
      and(
        eq(n.cancelled, false),
        lt(n.startsAt, new Date(Date.now() - GRACE_MS)),
        or(
          exists(db.select({ x: sql`1` }).from(schema.nightRsvp).where(eq(schema.nightRsvp.gameNightId, n.id))),
          exists(db.select({ x: sql`1` }).from(schema.gamePlan).where(eq(schema.gamePlan.gameNightId, n.id))),
          exists(db.select({ x: sql`1` }).from(schema.play).where(and(eq(schema.play.night, n.night), eq(schema.play.playedOn, n.date)))),
        ),
      ),
    )
    .orderBy(desc(n.startsAt))
    .limit(limit + 1);
  return { nights: await loadNights(rows.slice(0, limit)), more: rows.length > limit };
}

export type NightSummary = { id: number; title: string; startsAt: string };

/** Each night by its kind and date ("core:2026-10-18"), for linking plays to their night */
export async function getNightsByDate(keys: { night: Night; date: string }[]) {
  if (keys.length === 0) return new Map<string, NightSummary>();
  const rows = await db
    .select({ id: schema.gameNight.id, night: schema.gameNight.night, date: schema.gameNight.date, title: schema.gameNight.title, startsAt: schema.gameNight.startsAt })
    .from(schema.gameNight)
    .where(or(...keys.map((k) => and(eq(schema.gameNight.night, k.night), eq(schema.gameNight.date, k.date)))));
  return new Map(rows.map((r) => [`${r.night}:${r.date}`, { id: r.id, title: r.title, startsAt: r.startsAt.toISOString() }]));
}

/**
 * A fingerprint of everything a night's page (or Plan, with no id) shows that can change
 * elsewhere: the night, answers, games, votes and prep, and on Plan the polls to find a date.
 * Open pages compare it every few seconds and refresh when it moves, so a change made in
 * Discord shows up without a reload.
 */
export async function nightsVersion(nightId?: number) {
  const only = (col: unknown) => (nightId ? sql`where ${col} = ${nightId}` : sql``);
  const n = schema.gameNight;
  const [row] = await db.all<{ v: string }>(sql`
    select
      (select coalesce(max(${n.updatedAt}), 0) || ':' || count(*) from ${n} ${only(n.id)}) || '|' ||
      (select coalesce(max(responded_at), 0) || ':' || count(*) || ':' || coalesce(sum(guests), 0) from night_rsvp ${only(sql`game_night_id`)}) || '|' ||
      (select coalesce(max(updated_at), 0) || ':' || count(*) || ':' || coalesce(sum(chosen), 0) from game_plan ${only(sql`game_night_id`)}) || '|' ||
      (select count(*) from plan_vote v join game_plan p on p.id = v.plan_id ${only(sql`p.game_night_id`)}) || '|' ||
      (select count(*) from plan_ready r join game_plan p on p.id = r.plan_id ${only(sql`p.game_night_id`)}) ||
      ${nightId ? sql`''` : sql`'|' || (select coalesce(max(updated_at), 0) || ':' || count(*) from date_poll) || ':' || (select count(*) from date_poll_option) || ':' || (select count(*) from date_poll_vote)`} as v
  `);
  return row?.v ?? "";
}
