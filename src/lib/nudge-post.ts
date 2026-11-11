import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { CASUAL_NIGHT, REMINDER_HOURS, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { canPostToDiscord, discordCode, postsNights, replyToMessage, sendDirectMessage } from "./discord";
import { isClaim, postChannel } from "./night-post";
import { logNudgeDm, logNudgeDue, rateNudgeDm, rateNudges, reminderDue, reminderMessage } from "./nudges";
import { fillSeats } from "./rsvp";
import { syncDiscordPlays } from "./sync";

/**
 * Sends the nudges around nights Boardroom runs (nudges.ts says when each is due). Run through
 * the day by /api/cron/tick; each night gets each nudge once.
 */

const HOUR = 3_600_000;
const n = schema.gameNight;

/** Reply to each night's post when it's about to start, pinging whoever's going or a maybe. Returns the nights reminded. */
export async function sendReminders(now = new Date()) {
  if (!REMINDER_HOURS) return [];
  const rows = await db
    .select()
    .from(n)
    .where(and(eq(n.cancelled, false), eq(n.findingDate, false), isNull(n.remindedAt), isNotNull(n.messageId), gt(n.startsAt, now), lte(n.startsAt, new Date(now.getTime() + REMINDER_HOURS * HOUR))));
  const reminded: number[] = [];
  for (const row of rows) {
    if (!reminderDue(row, now, REMINDER_HOURS) || !postsNights(row.night) || isClaim(row.messageId)) continue;
    // Claimed first, so two ticks running at once don't both remind
    const claimed = await db.update(n).set({ remindedAt: now }).where(and(eq(n.id, row.id), isNull(n.remindedAt))).returning({ id: n.id });
    if (!claimed.length) continue;
    const answers = await db
      .select({ name: schema.player.name, discordId: schema.player.discordId, status: schema.nightRsvp.status, guests: schema.nightRsvp.guests })
      .from(schema.nightRsvp)
      .innerJoin(schema.player, eq(schema.player.id, schema.nightRsvp.playerId))
      .where(and(eq(schema.nightRsvp.gameNightId, row.id), inArray(schema.nightRsvp.status, ["going", "maybe"])))
      .orderBy(schema.nightRsvp.respondedAt);
    // Anyone still waiting for a seat isn't told to come
    const { waitlist } = fillSeats(answers.filter((a) => a.status === "going"), row.capacity, row.guests);
    const people = answers.filter((a) => !waitlist.includes(a));
    // In the order they said they'd bring something; reminderMessage names each once
    const bringing = await db
      .select({ name: schema.user.name, discordId: schema.user.discordId })
      .from(schema.gamePlan)
      .innerJoin(schema.user, eq(schema.user.id, schema.gamePlan.bringerId))
      .where(eq(schema.gamePlan.gameNightId, row.id))
      .orderBy(schema.gamePlan.id);
    const { body, allowedMentions } = reminderMessage({ ...row, people, bringing });
    try {
      await replyToMessage(await postChannel(row), row.messageId!, body, allowedMentions);
      reminded.push(row.id);
    } catch (err) {
      // The next tick tries again, until the night starts
      console.error(`Couldn't remind night ${row.id}'s channel`, err);
      await db.update(n).set({ remindedAt: null }).where(eq(n.id, row.id));
    }
  }
  return reminded;
}

/**
 * DM whoever made each night that's over with nothing logged, asking them to log it. Returns
 * the nights they were asked about.
 */
export async function sendLogNudges(now = new Date()) {
  if (!process.env.DISCORD_BOT_TOKEN) return [];
  const rows = await db
    .select()
    .from(n)
    .where(and(isNotNull(n.createdBy), eq(n.cancelled, false), eq(n.findingDate, false), isNull(n.logNudgedAt), gt(n.startsAt, new Date(now.getTime() - 4 * 24 * HOUR)), lte(n.startsAt, now)));
  const due = rows.filter((row) => logNudgeDue(row, now, TIME_ZONE));
  if (due.length === 0) return [];
  // A night someone posted by hand in Discord is logged too: read those first
  if (canPostToDiscord()) await syncDiscordPlays().catch((err) => console.error("Discord sync before the log nudges failed", err));

  const nudged: number[] = [];
  for (const row of due) {
    const claimed = await db.update(n).set({ logNudgedAt: now }).where(and(eq(n.id, row.id), isNull(n.logNudgedAt))).returning({ id: n.id });
    if (!claimed.length) continue;
    const logged = await db.query.play.findFirst({ where: and(eq(schema.play.night, row.night), eq(schema.play.playedOn, row.date!)), columns: { id: true } });
    const creator = await db.query.user.findFirst({ where: eq(schema.user.id, row.createdBy!), columns: { discordId: true } });
    if (logged || !creator?.discordId) continue;
    try {
      await sendDirectMessage(creator.discordId, logNudgeDm({ title: row.title, url: SITE_URL ? `${SITE_URL}/events/${row.id}#log` : null, siteName: SITE_NAME }));
      nudged.push(row.id);
    } catch (err) {
      // Asked once: someone who doesn't take DMs (50007) won't start to by the next tick
      if (discordCode(err) !== 50007) console.error(`Couldn't ask about logging night ${row.id}`, err);
    }
  }
  return nudged;
}

/**
 * The morning after a casual night with plays logged, DM everyone with an account who played
 * (members and casual players alike), naming the games they haven't rated, so the next one's
 * planner has more to go on. Once a night; a night with nothing logged yet waits until it has.
 * Returns the people asked.
 */
export async function sendRateNudges(now = new Date()) {
  if (!process.env.DISCORD_BOT_TOKEN || !CASUAL_NIGHT) return [];
  const rows = await db
    .select()
    .from(n)
    .where(and(eq(n.night, "casual"), eq(n.cancelled, false), eq(n.findingDate, false), isNull(n.rateNudgedAt), gt(n.startsAt, new Date(now.getTime() - 4 * 24 * HOUR)), lte(n.startsAt, now)));
  const asked: string[] = [];
  for (const row of rows.filter((r) => logNudgeDue(r, now, TIME_ZONE))) {
    const plays = await db
      .select({ id: schema.play.id, gameId: schema.play.gameId, name: schema.play.gameName, title: schema.game.name })
      .from(schema.play)
      .leftJoin(schema.game, eq(schema.game.id, schema.play.gameId))
      .where(and(eq(schema.play.night, "casual"), eq(schema.play.playedOn, row.date!)));
    if (plays.length === 0) continue;
    const claimed = await db.update(n).set({ rateNudgedAt: now }).where(and(eq(n.id, row.id), isNull(n.rateNudgedAt))).returning({ id: n.id });
    if (!claimed.length) continue;

    const seats = await db
      .select({ playId: schema.playPlayer.playId, userId: schema.player.userId })
      .from(schema.playPlayer)
      .innerJoin(schema.player, eq(schema.player.id, schema.playPlayer.playerId))
      .where(and(inArray(schema.playPlayer.playId, plays.map((p) => p.id)), isNotNull(schema.player.userId)));
    const userIds = [...new Set(seats.map((s) => s.userId!))];
    if (userIds.length === 0) continue;
    const [opinions, people] = await Promise.all([
      db
        .select({ userId: schema.opinion.userId, gameId: schema.opinion.gameId })
        .from(schema.opinion)
        .where(and(inArray(schema.opinion.userId, userIds), isNotNull(schema.opinion.sentiment))),
      // Nobody an admin took off the site: the link is to a site they can't open
      db
        .select({ id: schema.user.id, discordId: schema.user.discordId })
        .from(schema.user)
        .where(and(inArray(schema.user.id, userIds), ne(schema.user.access, "removed"))),
    ]);
    const rated = new Map<string, Set<number>>();
    for (const o of opinions) rated.set(o.userId, (rated.get(o.userId) ?? new Set()).add(o.gameId));
    const discordOf = new Map(people.map((p) => [p.id, p.discordId]));
    const asks = rateNudges(
      plays.map((p) => ({ gameId: p.gameId, name: p.title ?? p.name, userIds: seats.filter((s) => s.playId === p.id).map((s) => s.userId!) })),
      rated,
    );
    for (const ask of asks) {
      const discordId = discordOf.get(ask.userId);
      if (!discordId) continue;
      try {
        await sendDirectMessage(discordId, rateNudgeDm({ title: row.title, games: ask.games, url: SITE_URL ? `${SITE_URL}/rankings/rate` : null, siteName: SITE_NAME }));
        asked.push(ask.userId);
      } catch (err) {
        if (discordCode(err) !== 50007) console.error(`Couldn't ask ${ask.userId} to rate night ${row.id}'s games`, err);
      }
    }
  }
  return asked;
}
