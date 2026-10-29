import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { REMINDER_HOURS, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { canPostToDiscord, discordCode, postsNights, replyToMessage, sendDirectMessage } from "./discord";
import { isClaim, postChannel } from "./night-post";
import { logNudgeDm, logNudgeDue, reminderDue, reminderMessage } from "./nudges";
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
    .where(and(eq(n.cancelled, false), isNull(n.remindedAt), isNotNull(n.messageId), gt(n.startsAt, now), lte(n.startsAt, new Date(now.getTime() + REMINDER_HOURS * HOUR))));
  const reminded: number[] = [];
  for (const row of rows) {
    if (!reminderDue(row, now, REMINDER_HOURS) || !postsNights(row.night) || isClaim(row.messageId)) continue;
    // Claimed first, so two ticks running at once don't both remind
    const claimed = await db.update(n).set({ remindedAt: now }).where(and(eq(n.id, row.id), isNull(n.remindedAt))).returning({ id: n.id });
    if (!claimed.length) continue;
    const people = await db
      .select({ name: schema.player.name, discordId: schema.player.discordId, status: schema.nightRsvp.status })
      .from(schema.nightRsvp)
      .innerJoin(schema.player, eq(schema.player.id, schema.nightRsvp.playerId))
      .where(and(eq(schema.nightRsvp.gameNightId, row.id), inArray(schema.nightRsvp.status, ["going", "maybe"])))
      .orderBy(schema.nightRsvp.respondedAt);
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
    .where(and(isNotNull(n.createdBy), eq(n.cancelled, false), isNull(n.logNudgedAt), gt(n.startsAt, new Date(now.getTime() - 4 * 24 * HOUR)), lte(n.startsAt, now)));
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
