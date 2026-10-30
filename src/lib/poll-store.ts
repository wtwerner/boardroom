import "server-only";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { MIN_PEOPLE, NIGHT_TITLES } from "@/config";
import { db, schema } from "@/db";
import { type DateAnswer, type Night, POLL_MAX_DATES } from "@/db/enums";
import { type Verdict, answeredBy, answerFor, dateVerdicts, resolveAnswers, rsvpFor, waitingOn } from "./date-answers";
import { ownNight, titleForGame } from "./night-store";
import { localDate, nightTitle } from "./nights";
import { handTitle } from "./night-title";

/**
 * A night finding its date (game_night.finding_date) offers a few in its poll, and everyone says
 * which work. Setting one dates the night; if that date falls through, the night goes back to
 * finding one with every answer kept. The night is the same throughout: its page, its post and
 * thread, its games. Shared by the site's actions and the Discord handlers like night-store.ts.
 * Errors are plain sentences, shown to people as they are.
 */

const p = schema.datePoll;
const o = schema.datePollOption;
const v = schema.datePollVote;
const g = schema.gameNight;

export type PollPerson = { playerId: number; name: string; discordId: string | null; userId: string | null };

/** A member, who a poll waits on: of either kind of night, since the casual night's answers that matter are theirs. No player yet for one who's never played or answered. */
export type PollMember = { playerId: number | null; name: string; discordId: string | null; userId: string };

export type PollDate = {
  id: number;
  /** ISO */
  startsAt: string;
  past: boolean;
  /** It was set, then fell through */
  fellThrough: boolean;
  yes: PollPerson[];
  maybe: PollPerson[];
  /** Can't, said or (`assumed`) left alone once they'd answered another date */
  no: (PollPerson & { assumed: boolean })[];
  /** Every member can come, it's the best so far, or too few can (date-answers.ts) */
  verdict: Verdict | null;
};

export type PollDetail = {
  id: number;
  nightId: number;
  night: Night;
  /** Every date went by without one being set */
  closed: boolean;
  dates: PollDate[];
  /** Everyone who has answered a date still on offer */
  answered: PollPerson[];
  /** The members it waits on */
  members: PollMember[];
  /** Members yet to answer a date still to come: they haven't answered, or a date was added since */
  waiting: PollMember[];
  /** The fewest who need to be able to come, for its kind of night */
  min: number;
  /** Whoever started it, who's told once everyone's answered */
  createdBy: string | null;
  /** When the members still waiting were last nudged (ISO) */
  nudgedAt: string | null;
  /** When it should be decided by, if whoever started it said (ISO) */
  decideBy: string | null;
};

/** The group's members, by name */
async function members(): Promise<PollMember[]> {
  const rows = await db
    .select({ userId: schema.user.id, userName: schema.user.name, userDiscordId: schema.user.discordId, playerId: schema.player.id, name: schema.player.name, discordId: schema.player.discordId })
    .from(schema.user)
    .leftJoin(schema.player, eq(schema.player.userId, schema.user.id))
    .orderBy(asc(schema.user.name));
  return rows.map((r) => ({ playerId: r.playerId, name: r.name ?? r.userName, discordId: r.discordId ?? r.userDiscordId, userId: r.userId }));
}

/** A poll, as stored */
export async function ownPoll(id: number) {
  const row = await db.query.datePoll.findFirst({ where: eq(p.id, id) });
  if (!row?.gameNightId) throw new Error("That's gone: it was deleted.");
  return { ...row, gameNightId: row.gameNightId };
}

/** The poll one of its dates is on */
export async function pollOfDate(optionId: number) {
  const option = await db.query.datePollOption.findFirst({ where: eq(o.id, optionId), columns: { pollId: true } });
  if (!option) throw new Error("That date isn't on offer anymore.");
  return ownPoll(option.pollId);
}

/** The night a poll is for, still finding its date */
async function findingNight(nightId: number) {
  const n = await ownNight(nightId);
  if (n.cancelled) throw new Error("That was called off.");
  if (!n.findingDate) throw new Error("Its date's set already.");
  return n;
}

/** Polls with their dates and everyone's answers, soonest date first */
async function loadPolls(ids: number[]): Promise<PollDetail[]> {
  if (!ids.length) return [];
  const [polls, dates, given, group] = await Promise.all([
    db.select().from(p).where(inArray(p.id, ids)),
    db.select().from(o).where(inArray(o.pollId, ids)).orderBy(asc(o.startsAt)),
    db
      .select({ optionId: v.optionId, playerId: v.playerId, answer: v.answer, at: v.votedAt, name: schema.player.name, discordId: schema.player.discordId, userId: schema.player.userId })
      .from(v)
      .innerJoin(o, eq(o.id, v.optionId))
      .innerJoin(schema.player, eq(schema.player.id, v.playerId))
      .where(inArray(o.pollId, ids)),
    members(),
  ]);
  const people = new Map(given.map((a) => [a.playerId, { playerId: a.playerId, name: a.name, discordId: a.discordId, userId: a.userId }]));
  const now = Date.now();
  return ids.flatMap((id) => {
    const row = polls.find((r) => r.id === id);
    if (!row?.gameNightId) return [];
    const mine = dates.filter((d) => d.pollId === id);
    const facts = mine.map((d) => ({ id: d.id, createdAt: d.createdAt.toISOString(), fellThrough: d.fellThroughAt !== null }));
    const answers = given.filter((a) => mine.some((d) => d.id === a.optionId)).map((a) => ({ optionId: a.optionId, playerId: a.playerId, answer: a.answer, at: a.at.toISOString() }));
    const resolved = resolveAnswers(facts, answers);
    // Waiting on whoever hasn't answered every date still to come
    const open = mine.flatMap((d, i) => (d.fellThroughAt || d.startsAt.getTime() < now ? [] : [new Set(resolved[i].answers.map((a) => a.playerId))]));
    const seenAll = new Set(group.flatMap((m) => (m.playerId !== null && open.length && open.every((who) => who.has(m.playerId!)) ? [m.playerId] : [])));
    const min = MIN_PEOPLE[row.night];
    const shaped = mine.map((d, i) => {
      const said = (answer: DateAnswer) => resolved[i].answers.filter((a) => a.answer === answer);
      return {
        id: d.id,
        startsAt: d.startsAt.toISOString(),
        past: d.startsAt.getTime() < now,
        fellThrough: d.fellThroughAt !== null,
        yes: said("yes").map((a) => people.get(a.playerId)!),
        maybe: said("maybe").map((a) => people.get(a.playerId)!),
        no: said("no").map((a) => ({ ...people.get(a.playerId)!, assumed: a.assumed })),
      };
    });
    const verdicts = dateVerdicts(shaped, group.flatMap((m) => (m.playerId === null ? [] : [m.playerId])), min);
    return [
      {
        id: row.id,
        nightId: row.gameNightId,
        night: row.night,
        closed: row.closedAt !== null,
        dates: shaped.map((d) => ({ ...d, verdict: verdicts.get(d.id) ?? null })),
        answered: [...answeredBy(facts, answers)].map((playerId) => people.get(playerId)!),
        members: group,
        waiting: open.length ? waitingOn(group, seenAll) : [],
        min,
        createdBy: row.createdBy,
        nudgedAt: row.nudgedAt?.toISOString() ?? null,
        decideBy: row.decideBy?.toISOString() ?? null,
      },
    ];
  });
}

export async function loadPoll(id: number) {
  return (await loadPolls([id]))[0] ?? null;
}

/** A night's poll: the dates it was offered, and is again whenever its date falls through */
export async function pollForNight(nightId: number) {
  const row = await db.query.datePoll.findFirst({ where: eq(p.gameNightId, nightId), columns: { id: true }, orderBy: asc(p.id) });
  return row ? loadPoll(row.id) : null;
}

/** The polls of nights still finding their date, oldest first; `cancelled` for ones called off that could be reopened */
export async function findingPolls({ cancelled = false } = {}) {
  const rows = await db
    .select({ id: p.id })
    .from(p)
    .innerJoin(g, eq(g.id, p.gameNightId))
    .where(and(eq(g.findingDate, true), eq(g.cancelled, cancelled)))
    .orderBy(asc(g.createdAt));
  const polls = await loadPolls(rows.map((r) => r.id));
  return cancelled ? polls.filter((x) => x.dates.some((d) => !d.past && !d.fellThrough)) : polls;
}

/** Dates on offer: none gone by, fallen through, or there twice. Soonest first. */
function checkDates(dates: Date[], taken: Date[] = []) {
  if (dates.some((d) => d.getTime() < Date.now())) throw new Error("Pick dates that are coming up.");
  const seen = new Set(taken.map((d) => d.getTime()));
  return [...new Map(dates.filter((d) => !seen.has(d.getTime())).map((d) => [d.getTime(), d])).values()].sort((a, b) => a.getTime() - b.getTime());
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A night finding its date sorts by the first date still on offer */
async function placeNight(tx: Tx, pollId: number, nightId: number) {
  const dates = await tx.select({ startsAt: o.startsAt }).from(o).where(and(eq(o.pollId, pollId), isNull(o.fellThroughAt))).orderBy(asc(o.startsAt));
  const next = dates.find((d) => d.startsAt.getTime() >= Date.now()) ?? dates.at(-1);
  if (next) await tx.update(g).set({ startsAt: next.startsAt, updatedAt: new Date() }).where(eq(g.id, nightId));
}

/**
 * A night without a date yet, offering these: it has its page and post from the start, and its
 * date's set once people have said which work. Its post goes up after (night-post.ts).
 */
export async function createPoll(fields: { night: Night; title: string | null; location: string | null; dates: Date[]; decideBy?: Date | null }, createdBy: string) {
  const dates = checkDates(fields.dates);
  if (fields.decideBy && fields.decideBy.getTime() < Date.now()) throw new Error("Pick a day to decide by that's coming up.");
  if (!dates.length) throw new Error("Give a date or two to pick from.");
  if (dates.length > POLL_MAX_DATES) throw new Error(`Offer ${POLL_MAX_DATES} dates at most.`);
  return db.transaction(async (tx) => {
    const [night] = await tx
      .insert(g)
      .values({ night: fields.night, title: fields.title?.trim().slice(0, 100) || "", startsAt: dates[0], location: fields.location?.trim() || null, findingDate: true, createdBy })
      .returning();
    const [poll] = await tx.insert(p).values({ night: fields.night, gameNightId: night.id, createdBy, decideBy: fields.decideBy ?? null }).returning({ id: p.id });
    await tx.insert(o).values(dates.map((startsAt) => ({ pollId: poll.id, startsAt, createdAt: new Date() })));
    return { nightId: night.id, pollId: poll.id };
  });
}

/** Someone's answer to one of the dates, or none (null) to take it back */
export async function setDateAnswer(optionId: number, playerId: number, answer: DateAnswer | null) {
  const option = await db.query.datePollOption.findFirst({ where: eq(o.id, optionId) });
  if (!option) throw new Error("That date isn't on offer anymore.");
  const poll = await ownPoll(option.pollId);
  await findingNight(poll.gameNightId);
  if (option.fellThroughAt) throw new Error("That date fell through.");
  if (answer && option.startsAt.getTime() < Date.now()) throw new Error("That date's gone by.");
  const key = and(eq(v.optionId, optionId), eq(v.playerId, playerId));
  if (answer) {
    await db
      .insert(v)
      .values({ optionId, playerId, answer, votedAt: new Date() })
      .onConflictDoUpdate({ target: [v.optionId, v.playerId], set: { answer, votedAt: new Date() } });
  } else await db.delete(v).where(key);
  // Bumped so open pages notice
  await db.update(p).set({ updatedAt: new Date() }).where(eq(p.id, poll.id));
  return { pollId: poll.id, nightId: poll.gameNightId };
}

/** Someone's own answer to a date, said or not */
export async function answerOf(optionId: number, playerId: number) {
  const row = await db.query.datePollVote.findFirst({ where: and(eq(v.optionId, optionId), eq(v.playerId, playerId)), columns: { answer: true } });
  return row?.answer ?? null;
}

/** None of the dates on offer work for someone: can't, on every one still coming up */
export async function noDatesWork(pollId: number, playerId: number) {
  const poll = await ownPoll(pollId);
  await findingNight(poll.gameNightId);
  const dates = (await db.select().from(o).where(and(eq(o.pollId, pollId), isNull(o.fellThroughAt)))).filter((d) => d.startsAt.getTime() >= Date.now());
  if (!dates.length) throw new Error("Every date's gone by.");
  const now = new Date();
  for (const d of dates) {
    await db
      .insert(v)
      .values({ optionId: d.id, playerId, answer: "no", votedAt: now })
      .onConflictDoUpdate({ target: [v.optionId, v.playerId], set: { answer: "no", votedAt: now } });
  }
  await db.update(p).set({ updatedAt: now }).where(eq(p.id, pollId));
  return { pollId, nightId: poll.gameNightId };
}

/** Another date on offer. Everyone who's answered is waiting on it until they do. */
export async function addPollDate(pollId: number, startsAt: Date) {
  const poll = await ownPoll(pollId);
  const n = await findingNight(poll.gameNightId);
  if (startsAt.getTime() < Date.now()) throw new Error("Pick a date that's coming up.");
  const dates = await db.select({ startsAt: o.startsAt, fellThroughAt: o.fellThroughAt }).from(o).where(eq(o.pollId, pollId));
  const same = dates.find((d) => d.startsAt.getTime() === startsAt.getTime());
  if (same) throw new Error(same.fellThroughAt ? "That date fell through already." : "That date's on offer already.");
  const live = dates.filter((d) => !d.fellThroughAt && d.startsAt.getTime() >= Date.now());
  if (live.length >= POLL_MAX_DATES) throw new Error(`That's ${POLL_MAX_DATES} dates already, the most there can be.`);
  await db.transaction(async (tx) => {
    // To the millisecond (the column's default is to the second), so answers given just before it don't count for it
    await tx.insert(o).values({ pollId, startsAt, createdAt: new Date() });
    await tx.update(p).set({ closedAt: null, everyoneAnsweredAt: null, updatedAt: new Date() }).where(eq(p.id, pollId));
    await placeNight(tx, pollId, n.id);
  });
  return n;
}

/**
 * Set the night's date to one on offer. Everyone who answered says the same for the night:
 * works is going, if I have to is maybe, can't is can't make it, in the order they answered.
 * Its post becomes the night's card (night-post.ts). Returns the night, and who's going and a maybe.
 */
export async function setPollDate(pollId: number, optionId: number) {
  const poll = await loadPoll(pollId);
  if (!poll) throw new Error("That's gone: it was deleted.");
  const n = await findingNight(poll.nightId);
  const option = poll.dates.find((d) => d.id === optionId);
  if (!option || option.fellThrough) throw new Error("That date isn't on offer anymore.");
  if (option.past) throw new Error("That date's gone by. Pick one that's coming up.");

  const startsAt = new Date(option.startsAt);
  const date = localDate(startsAt);
  // Claimed first, so two people setting it at once don't both
  const claimed = await db
    .update(g)
    .set({ findingDate: false, startsAt, date, title: n.title || nightTitle(n.night, date), remindedAt: null, logNudgedAt: null })
    .where(and(eq(g.id, n.id), eq(g.findingDate, true)))
    .returning({ id: g.id });
  if (!claimed.length) throw new Error("Someone just set its date.");

  const raw = await db.select({ playerId: v.playerId, answer: v.answer, at: v.votedAt }).from(v).where(eq(v.optionId, optionId));
  const at = new Map(raw.map((a) => [a.playerId, a.at]));
  const answers = [...option.yes.map((x) => ({ ...x, answer: "yes" as const })), ...option.maybe.map((x) => ({ ...x, answer: "maybe" as const })), ...option.no.map((x) => ({ ...x, answer: "no" as const }))];
  await db.transaction(async (tx) => {
    await tx.delete(schema.nightRsvp).where(eq(schema.nightRsvp.gameNightId, n.id));
    if (answers.length) {
      await tx
        .insert(schema.nightRsvp)
        // An answer doesn't record whether it came from the site or Discord, and nothing reads "via"
        .values(answers.map((x) => ({ gameNightId: n.id, playerId: x.playerId, status: rsvpFor(x.answer), via: "site" as const, respondedAt: at.get(x.playerId) ?? new Date() })));
    }
  });
  // Named by the template, its title follows the game locked in for it
  await titleForGame(n.id);
  return { night: await ownNight(n.id), going: option.yes, maybe: option.maybe };
}

/**
 * The night's date fell through, so it goes back to finding one. Nothing's lost: the date stays
 * on offer as fallen through, with everyone's answers for the night as their answers to it, the
 * other dates keep theirs, and `dates` are offered too. A night made with a date gets its poll
 * now. Its post turns back into the dates on offer (night-post.ts); its games stay.
 */
export async function dateFellThrough(nightId: number, dates: Date[], userId: string) {
  const n = await ownNight(nightId);
  if (n.cancelled) throw new Error("That was cancelled.");
  if (n.findingDate) throw new Error("It's finding a date already.");
  if (n.startsAt.getTime() <= Date.now()) throw new Error("That's been and gone.");
  const offered = checkDates(dates);

  return db.transaction(async (tx) => {
    const found = await tx.query.datePoll.findFirst({ where: eq(p.gameNightId, n.id), columns: { id: true }, orderBy: asc(p.id) });
    const pollId = found?.id ?? (await tx.insert(p).values({ night: n.night, gameNightId: n.id, createdBy: userId }).returning({ id: p.id }))[0].id;
    const have = await tx.select().from(o).where(eq(o.pollId, pollId));

    // The date that fell through stays, with the night's answers as answers to it
    const now = new Date();
    const was = have.find((d) => d.startsAt.getTime() === n.startsAt.getTime());
    const wasId = was ? (await tx.update(o).set({ fellThroughAt: now }).where(eq(o.id, was.id)).returning({ id: o.id }))[0].id : (await tx.insert(o).values({ pollId, startsAt: n.startsAt, fellThroughAt: now }).returning({ id: o.id }))[0].id;
    const rsvps = await tx
      .select({ playerId: schema.nightRsvp.playerId, status: schema.nightRsvp.status, respondedAt: schema.nightRsvp.respondedAt, name: schema.player.name, discordId: schema.player.discordId })
      .from(schema.nightRsvp)
      .innerJoin(schema.player, eq(schema.player.id, schema.nightRsvp.playerId))
      .where(eq(schema.nightRsvp.gameNightId, n.id));
    for (const r of rsvps) {
      const answer = answerFor(r.status);
      await tx
        .insert(v)
        .values({ optionId: wasId, playerId: r.playerId, answer, votedAt: r.respondedAt })
        .onConflictDoUpdate({ target: [v.optionId, v.playerId], set: { answer, votedAt: r.respondedAt } });
    }
    await tx.delete(schema.nightRsvp).where(eq(schema.nightRsvp.gameNightId, n.id));

    const add = checkDates(offered, have.map((d) => d.startsAt));
    if (add.length) await tx.insert(o).values(add.map((startsAt) => ({ pollId, startsAt, createdAt: now })));
    const live = [...have.filter((d) => d.id !== wasId && !d.fellThroughAt).map((d) => d.startsAt), ...add].filter((d) => d.getTime() >= Date.now());
    if (!live.length) throw new Error("Give a date or two to pick from.");
    if (live.length > POLL_MAX_DATES) throw new Error(`Offer ${POLL_MAX_DATES} dates at most.`);

    // A title the template made is made again once there's a date; one named by hand stays
    const title = handTitle(n.title, NIGHT_TITLES[n.night], n.date ?? localDate(n.startsAt)) ?? "";
    await tx.update(g).set({ findingDate: true, date: null, title, remindedAt: null, logNudgedAt: null }).where(eq(g.id, n.id));
    await tx.update(p).set({ closedAt: null, everyoneAnsweredAt: null, updatedAt: now }).where(eq(p.id, pollId));
    await placeNight(tx, pollId, n.id);

    const games = await tx.select({ id: schema.gamePlan.id }).from(schema.gamePlan).where(eq(schema.gamePlan.gameNightId, n.id));
    return {
      pollId,
      night: n.night,
      was: n.startsAt,
      going: rsvps.filter((r) => r.status === "going" || r.status === "waitlist").map((r) => ({ name: r.name, discordId: r.discordId })),
      games: games.length,
    };
  });
}

/** Back on after being called off, answers and all, while one of its dates is still coming up */
export async function reopenPoll(pollId: number) {
  const poll = await loadPoll(pollId);
  if (!poll) throw new Error("That's gone: it was deleted.");
  const n = await ownNight(poll.nightId);
  if (!n.cancelled) throw new Error("That's still on.");
  if (!poll.dates.some((d) => !d.past && !d.fellThrough)) throw new Error("Every date on that has gone by. Find a date again instead.");
  const reopened = await db.update(g).set({ cancelled: false }).where(and(eq(g.id, n.id), eq(g.cancelled, true))).returning({ id: g.id });
  if (!reopened.length) throw new Error("Someone just reopened that.");
  return n;
}

/**
 * The dates that stay on offer if the night's date falls through: the others still coming up,
 * soonest first, with how many can come to each. None for a night with no poll.
 */
export async function datesStaying(nightId: number) {
  const n = await ownNight(nightId);
  const poll = await pollForNight(nightId);
  if (!poll) return [];
  return poll.dates
    .filter((d) => !d.past && !d.fellThrough && Date.parse(d.startsAt) !== n.startsAt.getTime())
    .map((d) => ({ startsAt: d.startsAt, votes: d.yes.length + d.maybe.length }));
}

/** Nights still finding a date whose every date has gone by, marked so. Returns the nights, so their posts can say so. */
export async function closeFinishedPolls(now = new Date()) {
  const rows = await db
    .select({ id: p.id, nightId: g.id, startsAt: o.startsAt, fellThroughAt: o.fellThroughAt })
    .from(p)
    .innerJoin(g, eq(g.id, p.gameNightId))
    .innerJoin(o, eq(o.pollId, p.id))
    .where(and(eq(g.findingDate, true), eq(g.cancelled, false), isNull(p.closedAt)));
  const open = new Set(rows.filter((r) => !r.fellThroughAt && r.startsAt.getTime() >= now.getTime()).map((r) => r.id));
  const done = [...new Set(rows.filter((r) => !open.has(r.id)).map((r) => r.id))];
  if (!done.length) return [];
  const closed = await db.update(p).set({ closedAt: now }).where(and(inArray(p.id, done), isNull(p.closedAt))).returning({ nightId: p.gameNightId });
  return closed.map((r) => r.nightId!);
}

/**
 * Once the last member answers, the first time since there was anything new to answer: the poll,
 * with its best date, for telling whoever started it. Null otherwise, or once they've been told.
 */
export async function everyoneJustAnswered(pollId: number) {
  const poll = await loadPoll(pollId);
  if (!poll || poll.waiting.length || !poll.members.length || !poll.dates.some((d) => !d.past && !d.fellThrough)) return null;
  const claimed = await db.update(p).set({ everyoneAnsweredAt: new Date() }).where(and(eq(p.id, pollId), isNull(p.everyoneAnsweredAt))).returning({ id: p.id });
  if (!claimed.length) return null;
  const starter = poll.createdBy ? poll.members.find((m) => m.userId === poll.createdBy) ?? null : null;
  return { poll, starter };
}

/** How long a nudge lasts before the members still waiting can be nudged again */
export const NUDGE_EVERY_MS = 12 * 3_600_000;

/** Nudge the members who haven't answered, at most every 12 hours. Returns who to ping. */
export async function nudgeWaiting(pollId: number) {
  const poll = await loadPoll(pollId);
  if (!poll) throw new Error("That's gone: it was deleted.");
  await findingNight(poll.nightId);
  if (!poll.waiting.length) throw new Error("Everyone's answered already.");
  const since = new Date(Date.now() - NUDGE_EVERY_MS);
  const claimed = await db
    .update(p)
    .set({ nudgedAt: new Date() })
    .where(and(eq(p.id, pollId), or(isNull(p.nudgedAt), lt(p.nudgedAt, since))))
    .returning({ id: p.id });
  if (!claimed.length) throw new Error("They were nudged in the last 12 hours. Give them a little longer.");
  return { nightId: poll.nightId, waiting: poll.waiting };
}

/** When a night finding its date should be decided by, or none. Whoever started it is pinged then, even if they were before. */
export async function setDecideBy(nightId: number, decideBy: Date | null) {
  await findingNight(nightId);
  if (decideBy && decideBy.getTime() < Date.now()) throw new Error("Pick a day to decide by that's coming up.");
  const poll = await db.query.datePoll.findFirst({ where: eq(p.gameNightId, nightId), columns: { id: true, decideBy: true }, orderBy: asc(p.id) });
  if (!poll || poll.decideBy?.getTime() === decideBy?.getTime()) return;
  await db.update(p).set({ decideBy, decidePingedAt: null, updatedAt: new Date() }).where(eq(p.id, poll.id));
}

/** Polls whose day to decide by has come, still finding a date, claimed so each is pinged once */
export async function decideByDue(now = new Date()) {
  const rows = await db
    .select({ id: p.id })
    .from(p)
    .innerJoin(g, eq(g.id, p.gameNightId))
    .where(and(eq(g.findingDate, true), eq(g.cancelled, false), isNull(p.decidePingedAt), lt(p.decideBy, now)));
  const due: PollDetail[] = [];
  for (const { id } of rows) {
    const claimed = await db.update(p).set({ decidePingedAt: now }).where(and(eq(p.id, id), isNull(p.decidePingedAt))).returning({ id: p.id });
    const poll = claimed.length ? await loadPoll(id) : null;
    if (poll) due.push(poll);
  }
  return due;
}
