import "server-only";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { type Night, POLL_MAX_DATES, type PollStatus } from "@/db/enums";
import { createNight } from "./night-store";
import { isClaim } from "./night-post";

/**
 * Polls to find a night's date, shared by the site's actions and the Discord handlers like
 * night-store.ts. Errors are plain sentences, shown to people as they are.
 */

const p = schema.datePoll;
const o = schema.datePollOption;
const v = schema.datePollVote;

export type PollVoter = { playerId: number; name: string; discordId: string | null; userId: string | null };

export type PollDetail = {
  id: number;
  night: Night;
  title: string | null;
  location: string | null;
  status: PollStatus;
  gameNightId: number | null;
  createdBy: string | null;
  /** Its post in Discord */
  url: string | null;
  posted: boolean;
  dates: { id: number; startsAt: string; past: boolean; voters: PollVoter[] }[];
};

/** A poll, as stored */
export async function ownPoll(id: number) {
  const row = await db.query.datePoll.findFirst({ where: eq(p.id, id) });
  if (!row) throw new Error("That poll's gone.");
  return row;
}

/** The poll one of its dates is on */
export async function pollOfDate(optionId: number) {
  const option = await db.query.datePollOption.findFirst({ where: eq(o.id, optionId), columns: { pollId: true } });
  if (!option) throw new Error("That date isn't on the poll anymore.");
  return ownPoll(option.pollId);
}

function assertOpen(row: { status: PollStatus }) {
  if (row.status === "picked") throw new Error("A date's already been picked for that.");
  if (row.status === "cancelled") throw new Error("That was called off.");
  if (row.status === "closed") throw new Error("Every date on that has gone by.");
}

/** Polls with their dates and who each works for, soonest date first */
export async function loadPolls(ids: number[]): Promise<PollDetail[]> {
  if (!ids.length) return [];
  const [polls, dates, votes] = await Promise.all([
    db.select().from(p).where(inArray(p.id, ids)),
    db.select().from(o).where(inArray(o.pollId, ids)).orderBy(asc(o.startsAt)),
    db
      .select({ optionId: v.optionId, playerId: v.playerId, name: schema.player.name, discordId: schema.player.discordId, userId: schema.player.userId })
      .from(v)
      .innerJoin(o, eq(o.id, v.optionId))
      .innerJoin(schema.player, eq(schema.player.id, v.playerId))
      .where(inArray(o.pollId, ids))
      .orderBy(asc(v.votedAt)),
  ]);
  const now = Date.now();
  return ids.flatMap((id) => {
    const row = polls.find((r) => r.id === id);
    if (!row) return [];
    return [
      {
        id: row.id,
        night: row.night,
        title: row.title,
        location: row.location,
        status: row.status,
        gameNightId: row.gameNightId,
        createdBy: row.createdBy,
        url: row.url,
        posted: Boolean(row.messageId && !isClaim(row.messageId)),
        dates: dates
          .filter((d) => d.pollId === id)
          .map((d) => ({
            id: d.id,
            startsAt: d.startsAt.toISOString(),
            past: d.startsAt.getTime() < now,
            voters: votes.filter((x) => x.optionId === d.id).map((x) => ({ playerId: x.playerId, name: x.name, discordId: x.discordId, userId: x.userId })),
          })),
      },
    ];
  });
}

export async function loadPoll(id: number) {
  return (await loadPolls([id]))[0] ?? null;
}

/** Polls still being voted on, oldest first */
export async function openPolls() {
  const rows = await db.select({ id: p.id }).from(p).where(eq(p.status, "open")).orderBy(asc(p.createdAt));
  return loadPolls(rows.map((r) => r.id));
}

/** A new poll with the dates it offers. Its post goes up after (poll-post.ts). */
export async function createPoll(fields: { night: Night; title: string | null; location: string | null; dates: Date[] }, createdBy: string) {
  const dates = [...new Map(fields.dates.map((d) => [d.getTime(), d])).values()];
  if (!dates.length) throw new Error("Give a date or two to pick from.");
  if (dates.length > POLL_MAX_DATES) throw new Error(`A poll fits ${POLL_MAX_DATES} dates.`);
  if (dates.some((d) => d.getTime() < Date.now())) throw new Error("Pick dates that are coming up.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(p)
      .values({ night: fields.night, title: fields.title?.trim() || null, location: fields.location?.trim() || null, createdBy })
      .returning();
    await tx.insert(o).values(dates.map((startsAt) => ({ pollId: row.id, startsAt })));
    return row;
  });
}

/** Say one of a poll's dates works for someone, or take it back. `on` undefined flips it. */
export async function setPollVote(optionId: number, playerId: number, on?: boolean) {
  const option = await db.query.datePollOption.findFirst({ where: eq(o.id, optionId) });
  if (!option) throw new Error("That date isn't on the poll anymore.");
  assertOpen(await ownPoll(option.pollId));
  const key = and(eq(v.optionId, optionId), eq(v.playerId, playerId));
  const had = Boolean(await db.query.datePollVote.findFirst({ where: key }));
  const want = on ?? !had;
  if (want && option.startsAt.getTime() < Date.now()) throw new Error("That date's gone by.");
  if (want && !had) await db.insert(v).values({ optionId, playerId, votedAt: new Date() }).onConflictDoNothing();
  if (!want && had) await db.delete(v).where(key);
  // Bumped so open pages notice the vote
  await db.update(p).set({ updatedAt: new Date() }).where(eq(p.id, option.pollId));
  return { pollId: option.pollId, on: want };
}

/** Another date for a poll that's still open */
export async function addPollDate(pollId: number, startsAt: Date) {
  const row = await ownPoll(pollId);
  assertOpen(row);
  if (startsAt.getTime() < Date.now()) throw new Error("Pick a date that's coming up.");
  const dates = await db.select({ startsAt: o.startsAt }).from(o).where(eq(o.pollId, pollId));
  if (dates.some((d) => d.startsAt.getTime() === startsAt.getTime())) throw new Error("That date's on the poll already.");
  if (dates.length >= POLL_MAX_DATES) throw new Error(`The poll's full: it fits ${POLL_MAX_DATES} dates.`);
  await db.insert(o).values({ pollId, startsAt });
  await db.update(p).set({ updatedAt: new Date() }).where(eq(p.id, pollId));
  return row;
}

/** Called off without a date: it stays, so its post can say so */
export async function cancelPoll(pollId: number) {
  const row = await ownPoll(pollId);
  assertOpen(row);
  await db.update(p).set({ status: "cancelled" }).where(eq(p.id, pollId));
  return row;
}

/** Open again after being called off, while one of its dates is still coming up. Its votes are kept. */
export async function reopenPoll(pollId: number) {
  const row = await ownPoll(pollId);
  if (row.status === "open") throw new Error("That's still open.");
  if (row.status !== "cancelled") assertOpen(row);
  const dates = await db.select({ startsAt: o.startsAt }).from(o).where(eq(o.pollId, pollId));
  if (!dates.some((d) => d.startsAt.getTime() >= Date.now())) throw new Error("Every date on that has gone by. Start a new poll instead.");
  const reopened = await db.update(p).set({ status: "open" }).where(and(eq(p.id, pollId), eq(p.status, "cancelled"))).returning({ id: p.id });
  if (!reopened.length) throw new Error("Someone just reopened that.");
  return row;
}

/** Polls called off that could be reopened: one of their dates is still coming up. Oldest first. */
export async function calledOffPolls(now = new Date()) {
  const rows = await db
    .select({ id: p.id, last: max(o.startsAt) })
    .from(p)
    .innerJoin(o, eq(o.pollId, p.id))
    .where(eq(p.status, "cancelled"))
    .groupBy(p.id)
    .orderBy(asc(p.createdAt));
  return loadPolls(rows.filter((r) => r.last && r.last.getTime() >= now.getTime()).map((r) => r.id));
}

/**
 * Pick one of a poll's dates: the night is made, and the poll's post and thread become the
 * night's, so poll-post.ts turns the post into the night's card. Nobody's answered for: the
 * night starts with no answers, and the post asks.
 */
export async function pickPollDate(pollId: number, optionId: number, fields: { title: string; location: string | null }, userId: string) {
  const row = await ownPoll(pollId);
  assertOpen(row);
  const option = await db.query.datePollOption.findFirst({ where: and(eq(o.id, optionId), eq(o.pollId, pollId)) });
  if (!option) throw new Error("That date isn't on the poll anymore.");
  if (option.startsAt.getTime() < Date.now()) throw new Error("That date's gone by. Pick one that's coming up.");

  // Claimed first, so two people picking at once don't make two nights
  const claimed = await db.update(p).set({ status: "picked" }).where(and(eq(p.id, pollId), eq(p.status, "open"))).returning({ id: p.id });
  if (!claimed.length) throw new Error("Someone just picked a date for that.");
  try {
    const night = await createNight({ night: row.night, title: fields.title, startsAt: option.startsAt, location: fields.location }, userId);
    const post = row.messageId && !isClaim(row.messageId) ? { channelId: row.channelId, messageId: row.messageId, threadId: row.threadId, threadCardId: row.threadCardId, url: row.url } : null;
    if (post) await db.update(schema.gameNight).set(post).where(eq(schema.gameNight.id, night.id));
    await db.update(p).set({ gameNightId: night.id }).where(eq(p.id, pollId));
    return { night, hadPost: Boolean(post) };
  } catch (err) {
    await db.update(p).set({ status: "open" }).where(eq(p.id, pollId));
    throw err;
  }
}

/** Open polls whose every date has gone by, marked closed. Returns them, so their posts can say so. */
export async function closeFinishedPolls(now = new Date()) {
  const rows = await db
    .select({ id: p.id, last: max(o.startsAt) })
    .from(p)
    .innerJoin(o, eq(o.pollId, p.id))
    .where(eq(p.status, "open"))
    .groupBy(p.id);
  const done = rows.filter((r) => r.last && r.last.getTime() < now.getTime()).map((r) => r.id);
  if (!done.length) return [];
  const closed = await db.update(p).set({ status: "closed" }).where(and(inArray(p.id, done), eq(p.status, "open"))).returning({ id: p.id });
  return closed.map((r) => r.id);
}
