import "server-only";
import { after } from "next/server";
import { and, asc, eq, gte, inArray, isNotNull, isNull, like, lt, or } from "drizzle-orm";
import { CASUAL_NIGHT, NIGHT_NAMES, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { type MessageBody, addToThread, announceChannel, deleteMessage, deleteThread, nightPingSetting, editMessage, eventsChannel, fetchAppEmoji, isForumChannel, messageUrl, postMessage, postWithThread, postsNights, renameThread } from "./discord";
import { buildNightAnnouncement } from "./announce-message";
import { type Announcement, removeAnnouncement, syncAnnouncement } from "./announce-post";
import { type NightDetail, loadNight } from "./events";
import { type CardPerson, type NightCard, type NightPing, buildNightMessage, buildNightThreadCopy, changeNote, goneMessage, nightPing, threadName } from "./night-message";

/**
 * Each night Boardroom runs has a post in its events channel and a thread for talking it over,
 * and, when the group sets a chat channel to announce it in, an announcement there linking to
 * the post (announce-post.ts). Everything that changes what the post shows calls
 * syncNightPost, wherever the change came from: the site, a button on the post, or a slash
 * command.
 */

const GRACE_MS = 12 * 3_600_000;
/** A post being made right now; claimed for this long so two requests don't both post it */
const CLAIM_MS = 60_000;

/**
 * Bring a night's post in step with the night: post it (with its thread) if it has none yet,
 * edit it, or move it when the night changed kind. A post someone deleted is posted again.
 * Its announcement in the chat channel, when the group has one, follows it. Does nothing for
 * nights that have been and gone without a post, or when the group hasn't set up posting.
 * `quiet` posts without the ping, for a night people were told about already.
 */
export async function syncNightPost(nightId: number, { quiet = false } = {}): Promise<"posted" | "edited" | null> {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) });
  if (!row || !postsNights(row.night)) return null;
  const channelId = eventsChannel(row.night)!;

  // It changed kind: the post (with its thread and announcement) moves to the other kind's
  // channels. A post in a channel that's no longer either kind's (the group moved its events
  // somewhere else) stays where it is, with its thread, until it's been and gone.
  const otherKind = eventsChannel(row.night === "core" ? "casual" : "core");
  if (row.messageId && !isClaim(row.messageId) && row.channelId !== channelId && row.channelId === otherKind) {
    await removePost(row);
    await db
      .update(schema.gameNight)
      .set({ channelId: null, messageId: null, threadId: null, threadCardId: null, url: null, announceChannelId: null, announceMessageId: null })
      .where(eq(schema.gameNight.id, row.id));
    Object.assign(row, { messageId: null, announceChannelId: null, announceMessageId: null });
  }

  const n = await loadNight(nightId);
  if (!n) return null;
  const c = await card(n);
  const body = buildNightMessage(c);
  const announceTo = announceChannel(row.night);
  // Nights coming up are announced; one whose post is in the chat channel itself needs none
  const announce = (shown: NightCard, url: string | null, postedIn: string | null, first?: NightPing | null) =>
    syncAnnouncement(
      { channelId: row.announceChannelId, messageId: row.announceMessageId },
      announceTo,
      buildNightAnnouncement(shown, url),
      { post: !n.cancelled && !n.past && postedIn !== announceTo, first: first ? { body: buildNightAnnouncement(shown, url, first), allowedMentions: first.allowedMentions } : undefined },
      saveNightAnnouncement(row.id),
    );

  if (row.messageId && !isClaim(row.messageId)) {
    if (await editMessage(await postChannel(row), row.messageId, body)) {
      await syncThreadCopy(row, buildNightThreadCopy(c), saveNightCopy(row.id));
      await announce(c, row.url, row.channelId);
      return "edited";
    }
    // Someone deleted the post: post it again below
    await db.update(schema.gameNight).set({ messageId: null, threadId: null, threadCardId: null, url: null }).where(eq(schema.gameNight.id, row.id));
  }
  if (n.cancelled || n.past) {
    await announce(c, null, null);
    return null;
  }

  // Claim it, so a second change arriving while this posts doesn't post it twice
  const claim = `pending:${Date.now()}`;
  const claimed = await db
    .update(schema.gameNight)
    .set({ messageId: claim })
    .where(
      and(
        eq(schema.gameNight.id, row.id),
        // Free, or claimed by a request that never finished (the timestamps all have 13 digits, so they compare as text)
        or(isNull(schema.gameNight.messageId), and(like(schema.gameNight.messageId, "pending:%"), lt(schema.gameNight.messageId, `pending:${Date.now() - CLAIM_MS}`))),
      ),
    )
    .returning({ id: schema.gameNight.id });
  if (!claimed.length) return null;
  try {
    // The first post pings whoever the group set for this kind of night, or its announcement
    // does when there is one, being where people read; edits never ping
    const ping = quiet ? null : nightPing(nightPingSetting(row.night));
    const pingPost = announceTo ? null : ping;
    const first = pingPost ? buildNightMessage(c, pingPost) : body;
    const posted = await postWithThread(channelId, threadName(n.title, n.startsAt, TIME_ZONE), first, pingPost?.allowedMentions);
    const where = posted.messageChannelId;
    const url = messageUrl(where, posted.messageId);
    await db.update(schema.gameNight).set({ channelId, messageId: posted.messageId, threadId: posted.threadId, url }).where(eq(schema.gameNight.id, row.id));
    // Anyone who answered while it was being posted was left off it; catch them up
    const now = await loadNight(nightId);
    const latest = now ? await card(now) : c;
    if (now && JSON.stringify(buildNightMessage(latest)) !== JSON.stringify(first)) await editMessage(where, posted.messageId, buildNightMessage(latest));
    await syncThreadCopy({ channelId, messageId: posted.messageId, threadId: posted.threadId, threadCardId: null }, buildNightThreadCopy(latest), saveNightCopy(row.id));
    // A night that already had an announcement (its post was deleted) doesn't ping again
    await announce(latest, url, channelId, row.announceMessageId ? null : ping);
  } catch (err) {
    await db.update(schema.gameNight).set({ messageId: null }).where(and(eq(schema.gameNight.id, row.id), eq(schema.gameNight.messageId, claim)));
    throw err;
  }
  return "posted";
}

const saveNightAnnouncement = (nightId: number) => async (next: Announcement, was: string | null) => {
  const n = schema.gameNight;
  const saved = await db
    .update(n)
    .set({ announceChannelId: next.channelId, announceMessageId: next.messageId })
    .where(and(eq(n.id, nightId), was ? eq(n.announceMessageId, was) : isNull(n.announceMessageId)))
    .returning({ id: n.id });
  return saved.length > 0;
};

/**
 * A copy of a post's buttons (with a line on where things stand) as the first message in its
 * thread. Discord shows the post at the top of its thread, but its buttons only work in the
 * channel, so the copy's are the ones to press there. Kept in step with the post, and made on the next change for posts from before there
 * were copies. A forum post is in its own thread already and needs none. `save` swaps the stored
 * id from `was` to the new copy's, false when another request got there first. Never throws:
 * the post itself is what matters.
 */
export async function syncThreadCopy(
  row: { channelId: string | null; messageId: string | null; threadId: string | null; threadCardId: string | null },
  body: MessageBody,
  save: (id: string, was: string | null) => Promise<boolean>,
) {
  if (!row.channelId || !row.threadId || !row.messageId || isClaim(row.messageId)) return;
  try {
    if (await isForumChannel(row.channelId)) return;
    if (row.threadCardId && (await editMessage(row.threadId, row.threadCardId, body))) return;
    const copy = await postMessage(row.threadId, body);
    if (!(await save(copy.id, row.threadCardId))) await deleteMessage(row.threadId, copy.id);
  } catch (err) {
    console.error(`Couldn't update the card in thread ${row.threadId}`, err);
  }
}

const saveNightCopy = (nightId: number) => async (id: string, was: string | null) => {
  const n = schema.gameNight;
  const saved = await db
    .update(n)
    .set({ threadCardId: id })
    .where(and(eq(n.id, nightId), was ? eq(n.threadCardId, was) : isNull(n.threadCardId)))
    .returning({ id: n.id });
  return saved.length > 0;
};

/**
 * Add people who are going or might be to the night's thread, so it shows in their channel
 * list: these players, or everyone who has answered so far (when the post has just gone up),
 * plus `alsoPlayerIds` whatever they answered (whoever made the night). People who can't make
 * it aren't added otherwise, and nobody is taken out.
 */
export async function joinThread(nightId: number, playerIds?: number[], alsoPlayerIds: number[] = []) {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { threadId: true, messageId: true } });
  if (!row?.threadId || isClaim(row.messageId)) return;
  const people = await db
    .select({ discordId: schema.player.discordId })
    .from(schema.nightRsvp)
    .innerJoin(schema.player, eq(schema.player.id, schema.nightRsvp.playerId))
    .where(
      and(
        eq(schema.nightRsvp.gameNightId, nightId),
        inArray(schema.nightRsvp.status, ["going", "maybe"]),
        isNotNull(schema.player.discordId),
        ...(playerIds ? [inArray(schema.nightRsvp.playerId, playerIds)] : []),
      ),
    );
  const also = alsoPlayerIds.length
    ? await db.select({ discordId: schema.player.discordId }).from(schema.player).where(and(inArray(schema.player.id, alsoPlayerIds), isNotNull(schema.player.discordId)))
    : [];
  for (const discordId of new Set([...people, ...also].map((p) => p.discordId!))) await addToThread(row.threadId, discordId);
}

/**
 * Run syncNightPost once the response has gone, so answering on the site stays instant.
 * `join` is someone who just answered, to add to the thread, and `creator` whoever made the
 * night, added once it's posted; `note` tells the thread what moved, and `renamed` renames the
 * thread for a title that changed without saying so (it follows the locked-in game). A Discord
 * hiccup is logged; the next change to the night posts it again.
 */
export function syncNightPostLater(nightId: number, opts: { join?: number; creator?: number; note?: { before: NoteFields; by: CardPerson }; renamed?: boolean } = {}) {
  after(async () => {
    try {
      const result = await syncNightPost(nightId);
      if (result === "posted") await joinThread(nightId, undefined, opts.creator ? [opts.creator] : []);
      else if (result && opts.join) await joinThread(nightId, [opts.join]);
      if (opts.note) await noteChange(nightId, opts.note.before, opts.note.by);
      if (opts.renamed && result === "edited") await renameNightThread(nightId);
    } catch (err) {
      console.error(`Couldn't update night ${nightId}'s post in Discord`, err);
    }
  });
}

type NoteFields = { startsAt: Date; location: string | null; title: string };

/** Tell the night's thread when it moves, is renamed, or changes place, and rename the thread to match */
async function noteChange(nightId: number, before: NoteFields, by: CardPerson) {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) });
  if (!row?.threadId || isClaim(row.messageId)) return;
  const iso = (d: Date) => d.toISOString();
  const note = changeNote({ ...before, startsAt: iso(before.startsAt) }, { startsAt: iso(row.startsAt), location: row.location, title: row.title }, by, await fetchAppEmoji());
  if (!note) return;
  await postMessage(row.threadId, { content: note });
  // The thread's name has the date in it
  if (before.title !== row.title || before.startsAt.getTime() !== row.startsAt.getTime()) await renameNightThread(nightId);
}

/** Name the night's thread for its title. A forum post's name is the post's title, which works the same way. */
export async function renameNightThread(nightId: number) {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { title: true, startsAt: true, threadId: true, messageId: true } });
  if (!row?.threadId || isClaim(row.messageId)) return;
  await renameThread(row.threadId, threadName(row.title, row.startsAt.toISOString(), TIME_ZONE)).catch((err) => console.error("Couldn't rename the night's thread", err));
}

/** Say something in a night's thread, if it has one */
export async function postInThread(nightId: number, content: string) {
  const row = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { threadId: true, messageId: true } });
  if (row?.threadId && !isClaim(row.messageId)) await postMessage(row.threadId, { content });
}

/**
 * Take a night's post (and its thread, when the bot may) and its announcement out of Discord,
 * for a night that's deleted or moved to the other kind's channel
 */
export async function removePost(
  row: Pick<typeof schema.gameNight.$inferSelect, "channelId" | "messageId" | "threadId"> & { threadCardId?: string | null; announceChannelId?: string | null; announceMessageId?: string | null },
) {
  await removeAnnouncement({ channelId: row.announceChannelId ?? null, messageId: row.announceMessageId ?? null });
  if (!row.messageId || isClaim(row.messageId) || !row.channelId) return;
  const forum = await isForumChannel(row.channelId);
  // Deleting a thread needs Manage Threads, which the bot may not have
  const threadGone = row.threadId ? await deleteThread(row.threadId).then(() => true, () => false) : false;
  if (!forum) {
    await deleteMessage(row.channelId, row.messageId).catch((err) => console.error("Couldn't delete the night's post", err));
    // A thread that stays keeps the copy of the card, whose buttons would act on what's gone
    if (!threadGone && row.threadId && row.threadCardId) await deleteMessage(row.threadId, row.threadCardId).catch((err) => console.error("Couldn't delete the card in the night's thread", err));
  } else if (!threadGone && row.threadId) {
    // A forum post is its thread: when it can't go, its card says the night is gone instead
    await editMessage(row.threadId, row.messageId, goneMessage()).catch((err) => console.error("Couldn't mark the night's post gone", err));
  }
}

/** Where a night's post lives: in its events channel, or in its own thread in a forum */
export async function postChannel(row: { channelId: string | null; threadId: string | null }) {
  return (await isForumChannel(row.channelId!)) && row.threadId ? row.threadId : row.channelId!;
}

export const isClaim = (messageId: string | null) => Boolean(messageId?.startsWith("pending:"));

/** What the post shows, from the night as the site shows it */
async function card(n: NightDetail): Promise<NightCard> {
  const bringerIds = [...new Set(n.games.flatMap((g) => [g.bringerId, g.askedId].filter((id) => id !== null)))];
  // Mentioned by their Discord account, so the post shows them as the server does
  const bringers = bringerIds.length
    ? await db.select({ id: schema.user.id, name: schema.user.name, discordId: schema.user.discordId }).from(schema.user).where(inArray(schema.user.id, bringerIds))
    : [];
  const bringerOf = new Map(bringers.map((b) => [b.id, { name: b.name, discordId: b.discordId }]));
  const game = (g: NightDetail["games"][number]) => ({ name: g.game.name, bggId: g.game.id, imageUrl: g.game.thumbnail });
  const person = (a: NightDetail["going"][number]) => ({ name: a.name, discordId: a.discordId, guests: a.guests });
  const lockedIn = n.games.find((g) => g.chosen);
  return {
    id: n.id,
    title: n.title,
    startsAt: n.startsAt,
    location: n.location,
    capacity: n.capacity,
    cancelled: n.cancelled,
    kind: n.night,
    kindName: CASUAL_NIGHT ? NIGHT_NAMES[n.night] : null,
    going: n.going.map(person),
    maybe: n.maybe.map(person),
    declined: n.declined.map(person),
    others: n.othersComing,
    plan:
      n.night === "core"
        ? { kind: "vote", lockedIn: lockedIn ? game(lockedIn) : null, proposals: n.games.map((g) => ({ ...game(g), votes: g.votes.length })) }
        : {
            kind: "bring",
            games: n.games.map((g) => ({
              ...game(g),
              bringer: g.bringerId ? (bringerOf.get(g.bringerId) ?? null) : null,
              asked: g.askedId ? (bringerOf.get(g.askedId) ?? null) : null,
            })),
          },
    // Most of the casual night's channel can't open the site, as with play posts
    planUrl: SITE_URL && n.night === "core" ? `${SITE_URL}/events/${n.id}` : null,
    siteName: SITE_NAME,
    emoji: await fetchAppEmoji(),
  };
}

/** Nights Boardroom runs that are coming up, soonest first, for the slash commands' night picker */
export function upcomingOwnNights() {
  const n = schema.gameNight;
  return db
    .select({ id: n.id, title: n.title, startsAt: n.startsAt, night: n.night })
    .from(n)
    .where(and(eq(n.cancelled, false), gte(n.startsAt, new Date(Date.now() - GRACE_MS))))
    .orderBy(asc(n.startsAt));
}
