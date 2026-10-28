import "server-only";
import { after } from "next/server";
import { and, eq, inArray, isNotNull, isNull, like, lt, or } from "drizzle-orm";
import { CASUAL_NIGHT, NIGHT_NAMES, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { addToThread, announceChannel, editMessage, eventsChannel, fetchAppEmoji, messageUrl, nightPingSetting, postMessage, postWithThread, postsNights, renameThread, replyToMessage } from "./discord";
import { buildPollAnnouncement } from "./announce-message";
import { type Announcement, syncAnnouncement } from "./announce-post";
import { isClaim, joinThread, postChannel, removePost, syncNightPost, syncThreadCopy } from "./night-post";
import { type NightPing, nightPing, threadName } from "./night-message";
import { type PollCard, buildPollMessage, buildPollThreadCopy, pickedMessage, pollThreadName } from "./poll-message";
import { type PollDetail, loadPoll } from "./poll-store";

/**
 * Each poll has a post in its kind of night's events channel, with a thread for talking it
 * over, and an announcement in the chat channel when the group has one, until a date is
 * picked: then the post, thread and announcement are the night's (night-post.ts).
 */

const p = schema.datePoll;
/** A post being made right now; claimed for this long so two requests don't both post it */
const CLAIM_MS = 60_000;

/** What a poll's called before it has a title: the kind of night it's for */
export const pollTitle = (poll: Pick<PollDetail, "title" | "night">) => poll.title || NIGHT_NAMES[poll.night];

/**
 * Bring a poll's post in step: post it (with its thread) if it has none yet, or edit it. A post
 * someone deleted is posted again while the poll is open. Does nothing once a date is picked,
 * when the post is the night's, or when the group hasn't set up posting.
 */
export async function syncPollPost(pollId: number): Promise<"posted" | "edited" | null> {
  const row = await db.query.datePoll.findFirst({ where: eq(p.id, pollId) });
  if (!row || row.status === "picked" || !postsNights(row.night)) return null;
  const poll = await loadPoll(pollId);
  if (!poll) return null;
  const c = await card(poll);
  const body = buildPollMessage(c);
  const announceTo = announceChannel(row.night);
  // Open polls are announced; one whose post is in the chat channel itself needs none
  const announce = (shown: PollCard, url: string | null, postedIn: string | null, first?: NightPing | null) =>
    syncAnnouncement(
      { channelId: row.announceChannelId, messageId: row.announceMessageId },
      announceTo,
      buildPollAnnouncement(shown, url),
      { post: row.status === "open" && postedIn !== announceTo, first: first ? { body: buildPollAnnouncement(shown, url, first), allowedMentions: first.allowedMentions } : undefined },
      savePollAnnouncement(row.id),
    );

  if (row.messageId && !isClaim(row.messageId)) {
    if (await editMessage(await postChannel(row), row.messageId, body)) {
      await syncThreadCopy(row, buildPollThreadCopy(c), savePollCopy(row.id));
      await announce(c, row.url, row.channelId);
      return "edited";
    }
    await db.update(p).set({ messageId: null, threadId: null, threadCardId: null, url: null }).where(eq(p.id, row.id));
  }
  if (row.status !== "open") {
    await announce(c, null, null);
    return null;
  }

  const claim = `pending:${Date.now()}`;
  const claimed = await db
    .update(p)
    .set({ messageId: claim })
    .where(and(eq(p.id, row.id), or(isNull(p.messageId), and(like(p.messageId, "pending:%"), lt(p.messageId, `pending:${Date.now() - CLAIM_MS}`)))))
    .returning({ id: p.id });
  if (!claimed.length) return null;
  const channelId = eventsChannel(row.night)!;
  try {
    // The first post pings whoever the group set for this kind of night, as a night's does, or
    // its announcement does when there is one
    const ping = nightPing(nightPingSetting(row.night));
    const pingPost = announceTo ? null : ping;
    const first = pingPost ? buildPollMessage(c, pingPost) : body;
    const posted = await postWithThread(channelId, pollThreadName(pollTitle(poll)), first, pingPost?.allowedMentions);
    const url = messageUrl(posted.messageChannelId, posted.messageId);
    await db.update(p).set({ channelId, messageId: posted.messageId, threadId: posted.threadId, url }).where(eq(p.id, row.id));
    const now = await loadPoll(pollId);
    if (now?.status === "picked") {
      // A date was picked while this posted, and the night went up on its own post
      await removePost({ channelId, messageId: posted.messageId, threadId: posted.threadId });
      return null;
    }
    const latest = now ? await card(now) : c;
    if (now && JSON.stringify(buildPollMessage(latest)) !== JSON.stringify(first)) await editMessage(posted.messageChannelId, posted.messageId, buildPollMessage(latest));
    await syncThreadCopy({ channelId, messageId: posted.messageId, threadId: posted.threadId, threadCardId: null }, buildPollThreadCopy(latest), savePollCopy(row.id));
    await announce(latest, url, channelId, row.announceMessageId ? null : ping);
  } catch (err) {
    await db.update(p).set({ messageId: null }).where(and(eq(p.id, row.id), eq(p.messageId, claim)));
    throw err;
  }
  return "posted";
}

const savePollAnnouncement = (pollId: number) => async (next: Announcement, was: string | null) => {
  const saved = await db
    .update(p)
    .set({ announceChannelId: next.channelId, announceMessageId: next.messageId })
    .where(and(eq(p.id, pollId), was ? eq(p.announceMessageId, was) : isNull(p.announceMessageId)))
    .returning({ id: p.id });
  return saved.length > 0;
};

const savePollCopy = (pollId: number) => async (id: string, was: string | null) => {
  const saved = await db
    .update(p)
    .set({ threadCardId: id })
    .where(and(eq(p.id, pollId), was ? eq(p.threadCardId, was) : isNull(p.threadCardId)))
    .returning({ id: p.id });
  return saved.length > 0;
};

/** Add these players to the poll's thread, so it shows in their channel list */
export async function joinPollThread(pollId: number, playerIds: number[]) {
  const row = await db.query.datePoll.findFirst({ where: eq(p.id, pollId), columns: { threadId: true, messageId: true } });
  if (!row?.threadId || isClaim(row.messageId) || !playerIds.length) return;
  const people = await db
    .select({ discordId: schema.player.discordId })
    .from(schema.player)
    .where(and(inArray(schema.player.id, playerIds), isNotNull(schema.player.discordId)));
  for (const { discordId } of people) await addToThread(row.threadId, discordId!);
}

/**
 * Run syncPollPost once the response has gone. `join` is someone who just said a date works,
 * added to the thread; `creator` whoever made the poll, added once it's posted, with anyone who
 * voted on the site before it went up.
 */
export function syncPollPostLater(pollId: number, opts: { join?: number; creator?: number; note?: string } = {}) {
  after(async () => {
    try {
      const result = await syncPollPost(pollId);
      if (result === "posted") {
        const poll = await loadPoll(pollId);
        const voters = poll?.dates.flatMap((d) => d.voters.map((x) => x.playerId)) ?? [];
        await joinPollThread(pollId, [...new Set([...(opts.creator ? [opts.creator] : []), ...voters])]);
      } else if (result && opts.join) await joinPollThread(pollId, [opts.join]);
      if (opts.note) await postInPollThread(pollId, opts.note);
    } catch (err) {
      console.error(`Couldn't update poll ${pollId}'s post in Discord`, err);
    }
  });
}

/** Say something in a poll's thread, if it has one */
async function postInPollThread(pollId: number, content: string) {
  const row = await db.query.datePoll.findFirst({ where: eq(p.id, pollId), columns: { threadId: true, messageId: true } });
  if (row?.threadId && !isClaim(row.messageId)) await postMessage(row.threadId, { content });
}

/**
 * Once a date's picked: the poll's post (and announcement) becomes the night's, its thread is
 * renamed for the night, and a reply pings the group and the people the date works for to say whether
 * they're coming. A poll that was never posted gets the night posted the usual way.
 */
export function announcePickedLater(pollId: number, optionId: number, by: { playerId: number }) {
  after(async () => {
    try {
      const poll = await loadPoll(pollId);
      const night = poll?.gameNightId ? await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, poll.gameNightId) }) : null;
      if (!poll || !night) return;
      const result = await syncNightPost(night.id);
      if (!result) return;
      if (result === "posted") {
        await joinThread(night.id, undefined, [by.playerId]);
        return;
      }
      if (night.threadId) {
        await renameThread(night.threadId, threadName(night.title, night.startsAt.toISOString(), TIME_ZONE)).catch((err) => console.error("Couldn't rename the poll's thread", err));
      }
      const voters = poll.dates.find((d) => d.id === optionId)?.voters ?? [];
      const { body, allowedMentions } = pickedMessage({ title: night.title, startsAt: night.startsAt.toISOString(), voters }, nightPing(nightPingSetting(night.night)));
      // On the announcement when there is one, where the night's ping goes; it links to the post
      const announced = night.announceChannelId && night.announceMessageId && !isClaim(night.announceMessageId);
      if (announced) await replyToMessage(night.announceChannelId!, night.announceMessageId!, body, allowedMentions);
      else await replyToMessage(await postChannel(night), night.messageId!, body, allowedMentions);
      await joinThread(night.id, undefined, [by.playerId]);
    } catch (err) {
      console.error(`Couldn't turn poll ${pollId}'s post into its night's`, err);
    }
  });
}

/** Edit the posts of polls that just closed, so they stop asking */
export async function updateClosedPollPosts(ids: number[]) {
  for (const id of ids) await syncPollPost(id).catch((err) => console.error(`Couldn't mark poll ${id} closed in Discord`, err));
}

/** What the post shows, from the poll as the site shows it */
async function card(poll: PollDetail): Promise<PollCard> {
  return {
    id: poll.id,
    title: pollTitle(poll),
    location: poll.location,
    status: poll.status === "picked" ? "closed" : poll.status,
    kind: poll.night,
    kindName: CASUAL_NIGHT ? NIGHT_NAMES[poll.night] : null,
    dates: poll.dates.map((d) => ({ id: d.id, startsAt: d.startsAt, past: d.past, voters: d.voters.map((x) => ({ name: x.name, discordId: x.discordId })) })),
    // Most of the casual night's channel can't open the site, as with its nights' posts
    pollUrl: SITE_URL && poll.night === "core" ? `${SITE_URL}/plan#poll-${poll.id}` : null,
    siteName: SITE_NAME,
    emoji: await fetchAppEmoji(),
  };
}
