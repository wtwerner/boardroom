import "server-only";
import { eq, ne } from "drizzle-orm";
import { CASUAL_NIGHT, DISCORD_BOT, NIGHT_NAMES, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import type { Night } from "@/db/enums";
import { postsNights } from "./discord";
import { emailReady, sendEmails } from "./email";
import * as say from "./email-message";
import type { Email } from "./email-message";
import { loadNight } from "./events";
import { waitingFor } from "./night-store";
import { type PollDetail, pollForNight } from "./poll-store";
import { getNightPeople } from "./queries";
import { byEmail } from "./reach";

/**
 * Emails about events, for whoever Discord doesn't reach (reach.ts): everyone, on a site without
 * it. Each goes out beside what Discord is told, from the same place, so a change made anywhere
 * reaches both. Nothing here throws; without email set up, nothing here does anything.
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

const frame = (nightId: number, hash = "") => ({
  siteName: SITE_NAME,
  timeZone: TIME_ZONE,
  url: `${SITE_URL}/events/${nightId}${hash}`,
  settingsUrl: `${SITE_URL}/settings#email`,
});

/**
 * Email whoever `to` picks of the accounts that can open the night and that Discord doesn't
 * reach. `build` is each person's email, or null for none. Returns how many went.
 */
async function emailAbout(night: Night, inDiscord: boolean, to: (a: Account) => boolean, build: (a: Account) => Email | null) {
  const people = (await accounts()).filter((a) => opens(a, night) && byEmail(a, inDiscord) && to(a));
  return sendEmails(people.flatMap((a) => {
    const email = build(a);
    return email ? [{ to: a.email, email }] : [];
  }));
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
    const email = poll
      ? say.pollStarted({ title: n.title, by: by.name, location: n.location, dates: poll.dates.filter((d) => !d.past && !d.fellThrough).map((d) => d.startsAt) }, frame(nightId))
      : say.nightMade({ ...n, by: by.name }, frame(nightId));
    await emailAbout(n.night, postsNights(n.night), to, () => email);
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
    const email = say.nightChanged(before, { ...found.n, by: by.name }, frame(nightId));
    if (email) await emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => email);
  });

/** Called off, or back on */
export const emailNightOff = (nightId: number, by: Actor, on = false) =>
  quietly(`night ${nightId} being ${on ? "reopened" : "called off"}`, async () => {
    const found = await involved(nightId);
    if (!found || found.n.past) return;
    const email = say.nightOff({ title: found.n.title, by: by.name, on, startsAt: found.n.findingDate ? null : found.n.startsAt }, frame(nightId));
    await emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => email);
  });

/** An event about to be deleted: read who'd want to know now, and tell them once it's gone */
export async function emailBeforeDelete(nightId: number, by: Actor): Promise<() => Promise<void>> {
  const found = emailReady() ? await involved(nightId).catch(() => null) : null;
  if (!found || found.n.past || found.n.cancelled) return async () => {};
  return () =>
    quietly(`night ${nightId} being deleted`, async () => {
      const email = say.nightOff({ title: found.n.title, by: by.name, on: false, startsAt: found.n.findingDate ? null : found.n.startsAt }, frame(nightId));
      await emailAbout(found.n.night, postsNights(found.n.night), (a) => isPlayer(found.playerIds)(a) && a.userId !== by.userId, () => email);
    });
}

/** Whoever was waiting for a seat and has one now */
export const emailSeated = (nightId: number, waiting: number[]) =>
  quietly(`seats on night ${nightId}`, async () => {
    const n = await loadNight(nightId);
    if (!n || n.findingDate || n.cancelled) return;
    const still = new Set(await waitingFor(nightId));
    const seated = n.going.map((a) => a.playerId).filter((id) => waiting.includes(id) && !still.has(id));
    await emailAbout(n.night, postsNights(n.night), isPlayer(seated), () => say.seatOpened(n, frame(nightId)));
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
    await emailAbout(n.night, postsNights(n.night), (a) => a.playerId !== byPlayerId && (crowd.has(a.userId) || mine(a) !== null), (a) => say.dateSet({ ...n, status: mine(a) }, frame(nightId)));
  });

/** Its date fell through: whoever was going */
export const emailFellThrough = (nightId: number, was: string, goingPlayerIds: number[], by: Actor) =>
  quietly(`night ${nightId}'s date falling through`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const email = say.dateFellThrough({ title: n.title, was }, frame(nightId));
    await emailAbout(n.night, postsNights(n.night), (a) => isPlayer(goingPlayerIds)(a) && a.userId !== by.userId, () => email);
  });

/** Nudge whoever hasn't said which dates work. Returns how many were emailed */
export async function emailDatesNudge(nightId: number, waitingUserIds: string[], by: Actor) {
  await quietly(`dates for night ${nightId}`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const email = say.datesNudge({ title: n.title, by: by.name }, frame(nightId));
    await emailAbout(n.night, n.posted, (a) => waitingUserIds.includes(a.userId), () => email);
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
    const line = best ? `${say.emailWhen(best.startsAt, TIME_ZONE)}, ${best.coming} can come` : null;
    const email = say.pollReady({ title: n.title || NIGHT_NAMES[n.night], why, best: line, waiting: poll.waiting.length }, frame(poll.nightId));
    await emailAbout(n.night, n.posted, (a) => a.userId === poll.createdBy, () => email);
  });

/** A few hours before: whoever's going or a maybe, with what they said they'd bring. `inDiscord`: its channel was reminded */
export const emailReminder = (nightId: number, inDiscord: boolean) =>
  quietly(`night ${nightId} coming up`, async () => {
    const n = await loadNight(nightId);
    if (!n) return;
    const going = new Set(n.going.map((a) => a.playerId));
    const maybe = new Set(n.maybe.map((a) => a.playerId));
    const bringing = (a: Account) => n.games.filter((g) => g.bringerId === a.userId).map((g) => g.game.name);
    await emailAbout(
      n.night,
      inDiscord,
      (a) => a.playerId !== null && (going.has(a.playerId) || maybe.has(a.playerId)),
      (a) => say.reminder({ ...n, status: going.has(a.playerId!) ? "going" : "maybe", bringing: bringing(a) }, frame(nightId)),
    );
  });

/** One person, about one night, who Discord's DMs don't reach. Returns whether it went */
async function emailOne(userId: string, night: Night, build: () => Email) {
  if (!emailReady()) return false;
  try {
    return (await emailAbout(night, DISCORD_BOT, (a) => a.userId === userId, build)) > 0;
  } catch (err) {
    console.error(`Couldn't email ${userId}`, err);
    return false;
  }
}

export const emailLogNudge = (userId: string, n: { id: number; night: Night; title: string }) => emailOne(userId, n.night, () => say.logNudge(n, frame(n.id, "#log")));

export const emailRateNudge = (userId: string, n: { id: number; night: Night; title: string }, games: string[]) =>
  emailOne(userId, n.night, () => say.rateNudge({ title: n.title, games }, { ...frame(n.id), url: `${SITE_URL}/rankings/rate` }));

export const emailBringAsk = (userId: string, n: { id: number; night: Night; title: string; startsAt: Date; location: string | null }, game: string, by: string) =>
  emailOne(userId, n.night, () => say.bringAsk({ ...n, by, game }, frame(n.id)));
