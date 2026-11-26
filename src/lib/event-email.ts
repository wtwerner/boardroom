import "server-only";
import { eq, ne } from "drizzle-orm";
import { CASUAL_NIGHT, DISCORD_BOT, NIGHT_NAMES, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import type { Night } from "@/db/enums";
import { auth } from "./auth";
import { buildCalendar } from "./calendar";
import { calendarEvent, calendarHost, nightKey } from "./calendar-store";
import { postsNights } from "./discord";
import { emailReady, sendEmails } from "./email";
import * as say from "./email-message";
import type { Draft, Frame } from "./email-message";
import { signStopKey } from "./email-stop";
import { loadNight } from "./events";
import { waitingFor } from "./night-store";
import { type PollDetail, pollForNight } from "./poll-store";
import { getNightPeople } from "./queries";
import { byEmail } from "./reach";
import { inSentence } from "./text";

/**
 * Emails about events, for whoever Discord doesn't reach, and anyone it does who asked for email
 * too (reach.ts): everyone, on a site without it. Each goes out beside what Discord is told, from
 * the same place, so a change made anywhere reaches both. Nothing here throws; without email set
 * up, nothing here does anything.
 */

/** Who did it: they're not emailed about it themselves */
export type Actor = { name: string; userId?: string | null };

type Account = Awaited<ReturnType<typeof accounts>>[number];

/** Everyone with an account still on the site, and the player they are */
async function accounts() {
  return db
    .select({
      userId: schema.user.id,
      playerId: schema.player.id,
      discordId: schema.user.discordId,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
      emailUpdates: schema.user.emailUpdates,
      emailToo: schema.user.emailToo,
      access: schema.user.access,
    })
    .from(schema.user)
    .leftJoin(schema.player, eq(schema.player.userId, schema.user.id))
    .where(ne(schema.user.access, "removed"));
}

/** Whether someone may open this kind of night. A casual account's own night only, while there is one */
const opens = (a: Account, night: Night) => a.access === "member" || (night === "casual" && CASUAL_NIGHT);

/** The people a kind of night is for: its members, or the casual night's regulars */
async function crowdOf(night: Night) {
  return new Set((await getNightPeople(night)).map((p) => p.id));
}

const secret = async () => (await auth.$context).secret;

/** Where someone stops emails about events, without signing in, and their settings */
async function stopFor(userId: string) {
  const key = signStopKey(userId, await secret());
  return { page: `${SITE_URL}/email/stop/${key}`, oneClick: `${SITE_URL}/api/email/stop/${key}`, settings: `${SITE_URL}/settings#email` };
}

/** The event's page, and once it has a date, its calendar file and the page for adding it */
async function frame(nightId: number, hash = ""): Promise<Frame> {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) });
  return {
    timeZone: TIME_ZONE,
    url: `${SITE_URL}/events/${nightId}${hash}`,
    calendar:
      row && !row.findingDate && !row.cancelled
        ? { url: `${SITE_URL}/calendar/${await nightKey(nightId)}`, ics: buildCalendar([calendarEvent(row)], { host: calendarHost() }) }
        : null,
  };
}

/**
 * Email whoever `to` picks of the accounts that can open the night and that Discord doesn't
 * reach. `build` is what to tell each person, or null for nothing. Returns how many went.
 */
async function emailAbout(night: Night, inDiscord: boolean, to: (a: Account) => boolean, build: (a: Account) => Draft | null) {
  const people = (await accounts()).filter((a) => opens(a, night) && byEmail(a, inDiscord) && to(a));
  const all = await Promise.all(
    people.map(async (a) => {
      const draft = build(a);
      return draft ? [{ to: a.email, email: say.buildEmail(draft, { siteName: SITE_NAME, stop: await stopFor(a.userId) }) }] : [];
    }),
  );
  return sendEmails(all.flat());
}

/** Run it, if the site emails anyone, without letting it get in the way of what it's about */
async function quietly(what: string, run: () => Promise<unknown>) {
  if (!emailReady()) return;
  try {
    await run();
  } catch (err) {
    console.error(`Couldn't email about ${what}`, err);
  }
}

const isPlayer = (ids: Iterable<number>) => {
  const set = new Set(ids);
  return (a: Account) => a.playerId !== null && set.has(a.playerId);
};

/** A new event, or one finding its date: its people are told, as the post and its ping tell Discord */
export const emailNewNight = (nightId: number, by: Actor) =>
  quietly(`new night ${nightId}`, async () => {
    const n = await loadNight(nightId);
    if (!n || n.cancelled || n.past) return;
    const crowd = await crowdOf(n.night);
    const to = (a: Account) => crowd.has(a.userId) && a.userId !== by.userId;
    const poll = n.findingDate ? await pollForNight(nightId) : null;
    const f = await frame(nightId);
    const draft = poll
      ? say.pollStarted({ title: n.title, by: by.name, location: n.location, dates: poll.dates.filter((d) => !d.past && !d.fellThrough).map((d) => d.startsAt) }, f)
      : say.nightMade({ ...n, by: by.name }, f);
    await emailAbout(n.night, postsNights(n.night), to, () => draft);
  });

/** Everyone who's said something other than no: going, a maybe, or that a date on offer works */
async function involved(nightId: number) {
  const n = await loadNight(nightId);
  if (!n) return null;
  if (!n.findingDate) return { n, playerIds: [...n.going, ...n.maybe, ...n.waitlist].map((a) => a.playerId) };
  const poll = await pollForNight(nightId);
  return { n, playerIds: poll?.dates.filter((d) => !d.fellThrough).flatMap((d) => [...d.yes, ...d.maybe].map((p) => p.playerId)) ?? [] };
}

/** It moved or is somewhere else */
export const emailNightChanged = (nightId: number, before: { startsAt: Date; location: string | null; title: string }, by: Actor) =>
  quietly(`night ${nightId} changing`, async () => {
    const found = await involved(nightId);
    if (!found || found.n.findingDate || found.n.cancelled) return;
    const draft = say.nightChanged(before, { ...found.n, by: by.name }, await frame(nightId));
    if (draft) await emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => draft);
  });

/** Called off, or back on */
export const emailNightOff = (nightId: number, by: Actor, on = false) =>
  quietly(`night ${nightId} being ${on ? "reopened" : "called off"}`, async () => {
    const found = await involved(nightId);
    if (!found || found.n.past) return;
    const draft = say.nightOff({ title: found.n.title, by: by.name, on, startsAt: found.n.findingDate ? null : found.n.startsAt }, await frame(nightId));
    await emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => draft);
  });

/** An event about to be deleted: read who'd want to know now, and tell them once it's gone */
export async function emailBeforeDelete(nightId: number, by: Actor): Promise<() => Promise<void>> {
  const found = emailReady() ? await involved(nightId).catch(() => null) : null;
  if (!found || found.n.past || found.n.cancelled) return async () => {};
  // Its page goes with it, so there's nothing to link to
  const draft = say.nightOff({ title: found.n.title, by: by.name, on: false, startsAt: found.n.findingDate ? null : found.n.startsAt }, { timeZone: TIME_ZONE, url: `${SITE_URL}/plan` });
  return () =>
    quietly(`night ${nightId} being deleted`, () => emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => draft));
}

/** Whoever was waiting for a seat and has one now */
export const emailSeated = (nightId: number, waiting: number[]) =>
  quietly(`seats on night ${nightId}`, async () => {
    const n = await loadNight(nightId);
    if (!n || n.findingDate || n.cancelled) return;
    const still = new Set(await waitingFor(nightId));
    const seated = n.going.map((a) => a.playerId).filter((id) => waiting.includes(id) && !still.has(id));
    if (!seated.length) return;
    const draft = say.seatOpened(n, await frame(nightId));
    await emailAbout(n.night, postsNights(n.night), isPlayer(seated), () => draft);
  });

/** Its date's set: its people, and anyone else who answered, with what they're down as */
export const emailDateSet = (nightId: number, byPlayerId: number) =>
  quietly(`night ${nightId}'s date`, async () => {
    const n = await loadNight(nightId);
    if (!n || n.findingDate || n.cancelled) return;
    const crowd = await crowdOf(n.night);
    const status = new Map([
      ...n.declined.map((a) => [a.playerId, "declined"] as const),
      ...n.maybe.map((a) => [a.playerId, "maybe"] as const),
      ...[...n.going, ...n.waitlist].map((a) => [a.playerId, "going"] as const),
    ]);
    const mine = (a: Account) => (a.playerId === null ? null : (status.get(a.playerId) ?? null));
    const f = await frame(nightId);
    await emailAbout(n.night, postsNights(n.night), (a) => a.playerId !== byPlayerId && (crowd.has(a.userId) || mine(a) !== null), (a) => say.dateSet({ ...n, status: mine(a) }, f));
  });

/** Its date fell through: whoever was going */
export const emailFellThrough = (nightId: number, was: string, goingPlayerIds: number[], by: Actor) =>
  quietly(`night ${nightId}'s date falling through`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const draft = say.dateFellThrough({ title: n.title, was }, await frame(nightId));
    await emailAbout(n.night, postsNights(n.night), (a) => isPlayer(goingPlayerIds)(a) && a.userId !== by.userId, () => draft);
  });

/** Nudge whoever hasn't said which dates work */
export async function emailDatesNudge(nightId: number, waitingUserIds: string[], by: Actor) {
  await quietly(`dates for night ${nightId}`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const draft = say.datesNudge({ title: n.title, by: by.name }, await frame(nightId));
    await emailAbout(n.night, n.posted, (a) => waitingUserIds.includes(a.userId), () => draft);
  });
}

/** Whether a nudge by email would reach any of them */
export async function canEmailAny(userIds: string[], inDiscord: boolean) {
  if (!emailReady() || !userIds.length) return false;
  return (await accounts()).some((a) => userIds.includes(a.userId) && byEmail(a, inDiscord));
}

/** Whoever started a poll: everyone's answered, or it's the day to decide by */
export const emailPollReady = (poll: PollDetail, why: "answered" | "decide", best: { startsAt: string; coming: number } | null) =>
  quietly(`poll ${poll.id}`, async () => {
    const n = await loadNight(poll.nightId);
    if (!n || !poll.createdBy) return;
    const line = best ? `${say.emailWhen(best.startsAt, TIME_ZONE)}, when ${best.coming} can come` : null;
    const draft = say.pollReady({ title: n.title || NIGHT_NAMES[n.night], why, best: line, waiting: poll.waiting.length }, await frame(poll.nightId));
    await emailAbout(n.night, n.posted, (a) => a.userId === poll.createdBy, () => draft);
  });

/** A few hours before: whoever's going or a maybe, with what they said they'd bring. `inDiscord`: its channel was reminded */
export const emailReminder = (nightId: number, inDiscord: boolean) =>
  quietly(`night ${nightId} coming up`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const going = new Set(n.going.map((a) => a.playerId));
    const maybe = new Set(n.maybe.map((a) => a.playerId));
    const bringing = (a: Account) => n.games.filter((g) => g.bringerId === a.userId).map((g) => g.game.name);
    const f = await frame(nightId);
    await emailAbout(
      n.night,
      inDiscord,
      (a) => a.playerId !== null && (going.has(a.playerId) || maybe.has(a.playerId)),
      (a) => say.reminder({ ...n, status: going.has(a.playerId!) ? "going" : "maybe", bringing: bringing(a) }, f),
    );
  });

/**
 * A message for one person that Discord would send as a DM. Emailed when the bot isn't there,
 * they haven't linked Discord, they asked for email too, or (`dmFailed`) the DM didn't go
 * through. Returns whether it went.
 */
async function emailOne(userId: string, night: Night, build: () => Promise<Draft>, dmFailed: boolean) {
  if (!emailReady()) return false;
  try {
    const draft = await build();
    return (await emailAbout(night, DISCORD_BOT && !dmFailed, (a) => a.userId === userId, () => draft)) > 0;
  } catch (err) {
    console.error(`Couldn't email ${userId}`, err);
    return false;
  }
}

/** `dmFailed`: Discord wouldn't take the DM, so email is the only way to reach them */
type Sent = { dmFailed?: boolean };

export const emailLogNudge = (userId: string, n: { id: number; night: Night; title: string }, { dmFailed = false }: Sent = {}) =>
  emailOne(userId, n.night, async () => say.logNudge(n, await frame(n.id, "#log")), dmFailed);

export const emailRateNudge = (userId: string, n: { id: number; night: Night; title: string }, games: string[], { dmFailed = false }: Sent = {}) =>
  emailOne(userId, n.night, async () => say.rateNudge({ title: n.title, games }, { timeZone: TIME_ZONE, url: `${SITE_URL}/rankings/rate` }), dmFailed);

export const emailBringAsk = (userId: string, n: { id: number; night: Night; title: string; startsAt: Date; location: string | null }, game: string, by: string, { dmFailed = false }: Sent = {}) =>
  emailOne(userId, n.night, async () => say.bringAsk({ ...n, by, game }, await frame(n.id)), dmFailed);

/** Someone an admin made a member who wasn't welcomed in Discord. Nothing about it is said there, so it's emailed whatever reaches them */
export const emailMadeMember = (userId: string, by: string) =>
  emailOne(userId, "core", async () => say.madeMember({ by, night: CASUAL_NIGHT ? inSentence(NIGHT_NAMES.core) : null }, { url: `${SITE_URL}/welcome` }), true);
