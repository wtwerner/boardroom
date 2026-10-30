import "server-only";
import { and, eq, inArray, isNotNull, isNull, like, lte, sql } from "drizzle-orm";
import { SITE_URL } from "@/config";
import { db, schema } from "@/db";
import type { Night } from "@/db/enums";
import { deleteMessage, deletePlaysMessage, editMessage, editPlaysMessage, fetchAppEmoji, postMessage, postPlaysMessage } from "./discord";
import { buildPlayMessage } from "./discord-message";
import { type FormattablePlay, formatPlayMessage } from "./play-parser";

/**
 * A night's log post: the one message in its plays channel listing what was played, with box
 * art, who played and links. Games logged later the same night (on the night's page as they're
 * played, or on Plays) are added to it rather than posted again. It links to the night's thread,
 * and the thread gets a copy of it, kept in step.
 */

type NightGame = { gameId: number; gameName: string };
export type SharedDetails = Omit<FormattablePlay, "games">;

/** The order a night's plays were played in: moved by hand, or else as they were logged */
export const playOrder = sql`coalesce(${schema.play.position}, ${schema.play.id})`;

/** The night on a date, for its page and its thread (one with a thread, if there are two) */
async function nightOn(night: Night, date: string) {
  const n = schema.gameNight;
  return (
    (await db.query.gameNight.findFirst({
      where: and(eq(n.night, night), eq(n.date, date), eq(n.cancelled, false)),
      columns: { id: true, threadId: true, messageId: true, logCopyId: true },
      orderBy: sql`${n.threadId} is null`,
    })) ?? null
  );
}

/** A thread being posted right now has a claim for its message id, not a real one */
const threadOf = (n: Awaited<ReturnType<typeof nightOn>>) => (n?.threadId && !n.messageId?.startsWith("pending:") ? n.threadId : null);

/**
 * The Discord card for a night's games: box art, how often the group has played each, and links back.
 * The casual night's posts don't link here: most of that channel can't sign in.
 */
export async function playCard(games: NightGame[], shared: SharedDetails, night: Night, opts: { loggedBy?: string; threadId?: string | null; nightId?: number | null } = {}) {
  const site = night === "core" ? SITE_URL : undefined;
  const posted = await Promise.all(
    games.map(async ({ gameId, gameName }) => {
      const [g] = await db.select({ image: schema.game.image, thumbnail: schema.game.thumbnail }).from(schema.game).where(eq(schema.game.id, gameId));
      const playNumber = await db.$count(schema.play, and(eq(schema.play.gameId, gameId), lte(schema.play.playedOn, shared.playedOn)));
      return { gameName, bggId: gameId, imageUrl: g?.image ?? g?.thumbnail, playNumber, appUrl: site ? `${site}/games/${gameId}` : null };
    }),
  );
  const nightUrl = site && opts.nightId ? `${site}/events/${opts.nightId}` : null;
  return buildPlayMessage({ ...shared, games: posted, loggedBy: opts.loggedBy, threadId: opts.threadId, nightUrl, emoji: await fetchAppEmoji() });
}

/** The plays a message of ours lists, in the night's order */
function playsIn(messageId: string) {
  return db
    .select()
    .from(schema.play)
    .where(and(eq(schema.play.source, "manual"), like(schema.play.sourceRef, `${messageId}:%`)))
    .orderBy(playOrder);
}

/** A message's card from its plays: everyone at any of its games, the notes, and who logged it */
async function cardFor(plays: (typeof schema.play.$inferSelect)[], night: Night, on: Awaited<ReturnType<typeof nightOn>>) {
  const seats = await db
    .select({ playId: schema.playPlayer.playId, name: schema.player.name, discordId: schema.player.discordId, playerId: schema.player.id })
    .from(schema.playPlayer)
    .innerJoin(schema.player, eq(schema.player.id, schema.playPlayer.playerId))
    .where(inArray(schema.playPlayer.playId, plays.map((p) => p.id)));
  // Everyone at any of its games, in the order the plays list them
  const players = [...new Map(plays.flatMap((p) => seats.filter((s) => s.playId === p.id)).map((s) => [s.playerId, s])).values()].map((s) => ({
    name: s.name,
    discordId: s.discordId ?? undefined,
  }));
  const [first] = plays;
  const shared: SharedDetails = {
    playedOn: first.playedOn,
    location: first.location,
    notes: [...new Set(plays.map((p) => p.notes).filter(Boolean))].join(" · ") || null,
    players,
  };
  const games = plays.map((p) => ({ gameId: p.gameId!, gameName: p.gameName })).filter((g) => g.gameId);
  const loggedBy = first.createdBy
    ? (await db.query.user.findFirst({ where: eq(schema.user.id, first.createdBy), columns: { name: true } }))?.name
    : undefined;
  return {
    body: await playCard(games, shared, night, { loggedBy, threadId: threadOf(on), nightId: on?.id }),
    copy: await playCard(games, shared, night, { loggedBy, nightId: on?.id }),
    content: formatPlayMessage({ ...shared, games: games.map((g) => ({ gameName: g.gameName, bggId: g.gameId })) }),
  };
}

/**
 * Rewrite one of our log posts after its plays changed (added, edited, moved or deleted): it
 * lists every play still logged against it, in the night's order, or goes away with the last
 * one. Refs are renumbered to match the order it lists them in, the way the Discord sync would
 * number them. The copy in the night's thread follows (`date` is the night's, for a post whose
 * last play was just deleted).
 */
export async function refreshLogPost(messageId: string, night: Night, date?: string) {
  const plays = await playsIn(messageId);
  if (plays.length === 0) {
    await deletePlaysMessage(night, messageId);
  } else {
    // Refs are unique, so they're moved out of the way before taking their new numbers
    const stale = plays.filter((p, i) => p.sourceRef !== `${messageId}:${i}`);
    for (const p of stale) await db.update(schema.play).set({ sourceRef: `${messageId}:moving-${p.id}` }).where(eq(schema.play.id, p.id));
    for (const p of stale) await db.update(schema.play).set({ sourceRef: `${messageId}:${plays.indexOf(p)}` }).where(eq(schema.play.id, p.id));
    const { body, content } = await cardFor(plays, night, await nightOn(night, plays[0].playedOn));
    await editPlaysMessage(night, messageId, body, { content });
  }
  // A deleted play is gone from the list, so its date comes with it
  const on = plays[0]?.playedOn ?? date;
  if (on) await syncLogCopy(night, on);
}

/** The night's log post: the newest of our messages its plays are in */
async function logMessageOn(night: Night, date: string) {
  const [row] = await db
    .select({ ref: schema.play.sourceRef })
    .from(schema.play)
    .where(and(eq(schema.play.source, "manual"), eq(schema.play.night, night), eq(schema.play.playedOn, date), isNotNull(schema.play.sourceRef)))
    .orderBy(sql`${schema.play.id} desc`)
    .limit(1);
  return row?.ref?.split(":")[0] ?? null;
}

/**
 * Put plays just logged on their night's log post: added to the one it has, or posted as a new
 * one. Each play gets the ref the Discord sync would give it, so the next sync skips them.
 */
export async function addToLog(night: Night, date: string, playIds: number[]) {
  const existing = await logMessageOn(night, date);
  let plays = await db.select().from(schema.play).where(inArray(schema.play.id, playIds)).orderBy(playOrder);
  if (existing) {
    for (const id of playIds) await db.update(schema.play).set({ sourceRef: `${existing}:new-${id}` }).where(eq(schema.play.id, id));
    try {
      return await refreshLogPost(existing, night);
    } catch (err) {
      if (!(err instanceof Error && /no longer exists/.test(err.message))) throw err;
      // Someone deleted it: post the night again, with what it listed and these plays
      plays = await playsIn(existing);
    }
  }
  const { body } = await cardFor(plays, night, await nightOn(night, date));
  const messageId = await postPlaysMessage(night, body);
  for (const [i, p] of plays.entries()) await db.update(schema.play).set({ sourceRef: `${messageId}:${i}` }).where(eq(schema.play.id, p.id));
  await syncLogCopy(night, date);
}

/**
 * The copy of a night's log post in its thread, so what was played is there with the talk about
 * it: posted with the first play the log post lists, edited along with it, and taken down when
 * the log post goes. Never throws: the log post itself is what matters.
 */
export async function syncLogCopy(night: Night, date: string) {
  const n = await nightOn(night, date);
  const thread = threadOf(n);
  if (!n || !thread) return;
  try {
    const messageId = await logMessageOn(night, date);
    const plays = messageId ? await playsIn(messageId) : [];
    if (plays.length === 0) {
      if (n.logCopyId) {
        await deleteMessage(thread, n.logCopyId).catch(() => undefined);
        await db.update(schema.gameNight).set({ logCopyId: null }).where(eq(schema.gameNight.id, n.id));
      }
      return;
    }
    const { copy } = await cardFor(plays, night, n);
    if (n.logCopyId && (await editMessage(thread, n.logCopyId, copy))) return;
    const posted = await postMessage(thread, copy);
    // Another request posted one first: keep theirs
    const saved = await db
      .update(schema.gameNight)
      .set({ logCopyId: posted.id })
      .where(and(eq(schema.gameNight.id, n.id), n.logCopyId ? eq(schema.gameNight.logCopyId, n.logCopyId) : isNull(schema.gameNight.logCopyId)))
      .returning({ id: schema.gameNight.id });
    if (!saved.length) await deleteMessage(thread, posted.id);
  } catch (err) {
    console.error(`Couldn't update the log in thread ${thread}`, err);
  }
}
