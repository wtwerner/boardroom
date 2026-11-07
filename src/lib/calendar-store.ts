import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { NIGHT_HOURS, NIGHT_NAMES, SITE_URL } from "@/config";
import { db, schema } from "@/db";
import { auth } from "./auth";
import { type CalendarEvent, readNightKey, signNightKey } from "./calendar";
import { nightGraceMs } from "./events";

/** A subscribed calendar keeps this much of the past, so last month's events don't vanish from it */
const FEED_HISTORY_MS = 60 * 24 * 3_600_000;

const HOUR_MS = 3_600_000;

type NightRow = typeof schema.gameNight.$inferSelect;

/** The night as a calendar shows it. Most of the casual night's people can't open the site, so its notes link to its post. */
export function calendarEvent(n: NightRow): CalendarEvent {
  return {
    id: n.id,
    title: n.title || NIGHT_NAMES[n.night],
    startsAt: n.startsAt,
    endsAt: new Date(n.startsAt.getTime() + NIGHT_HOURS * HOUR_MS),
    location: n.location,
    url: SITE_URL && n.night === "core" ? `${SITE_URL}/events/${n.id}` : n.url,
    cancelled: n.cancelled,
    updatedAt: n.updatedAt,
  };
}

/** What events' ids are made unique with, so one person's two groups don't clash */
export const calendarHost = () => (SITE_URL ? new URL(SITE_URL).hostname : "boardroom.local");

/** Someone said that's everything, or it's long enough since it started */
export const nightIsOver = (n: NightRow) => n.endedAt !== null || n.startsAt.getTime() < Date.now() - nightGraceMs();

const secret = async () => (await auth.$context).secret;

/** The key in the address of a night's calendar page, which works without signing in */
export const nightKey = async (nightId: number) => signNightKey(nightId, await secret());

/** The night a key is for, or null for a key we didn't sign or a night that's gone */
export async function nightFromKey(key: string) {
  const nightId = readNightKey(key, await secret());
  if (nightId === null) return null;
  return (await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) })) ?? null;
}

const newToken = () => randomBytes(24).toString("base64url");

/** The secret in someone's feed address, made the first time they ask for one */
export async function feedTokenFor(playerId: number) {
  // Only fills an empty one, so two at once end up with the same token
  await db.update(schema.player).set({ calendarToken: newToken() }).where(and(eq(schema.player.id, playerId), isNull(schema.player.calendarToken)));
  const player = await db.query.player.findFirst({ where: eq(schema.player.id, playerId), columns: { calendarToken: true } });
  if (!player?.calendarToken) throw new Error("That player is gone.");
  return player.calendarToken;
}

/** A new secret for someone's feed. The old address stops working, so they'll need to subscribe again. */
export async function replaceFeedToken(playerId: number) {
  const calendarToken = newToken();
  await db.update(schema.player).set({ calendarToken }).where(eq(schema.player.id, playerId));
  return calendarToken;
}

/**
 * Who's pressing a button in Discord, without adding them as a player: unlike answering, asking
 * for a calendar link shouldn't put someone on the group's lists
 */
export async function playerOfDiscordUser(discordId: string) {
  const [row] = await db
    .select({ id: schema.player.id })
    .from(schema.player)
    .leftJoin(schema.user, eq(schema.user.id, schema.player.userId))
    .where(or(eq(schema.player.discordId, discordId), eq(schema.user.discordId, discordId)))
    .limit(1);
  return row ?? null;
}

/**
 * Everything in someone's feed: the nights they're going to, might go to, or are waiting for a
 * seat at. Saying they can't make it takes one out. A cancelled night stays, marked cancelled, so
 * calendars show it was called off. Null when the token isn't anyone's.
 */
export async function feedEvents(token: string) {
  const player = await db.query.player.findFirst({ where: eq(schema.player.calendarToken, token), columns: { id: true } });
  if (!player) return null;
  const n = schema.gameNight;
  const rows = await db
    .select({ night: n })
    .from(schema.nightRsvp)
    .innerJoin(n, eq(n.id, schema.nightRsvp.gameNightId))
    .where(and(eq(schema.nightRsvp.playerId, player.id), inArray(schema.nightRsvp.status, ["going", "maybe", "waitlist"]), eq(n.findingDate, false), gte(n.startsAt, new Date(Date.now() - FEED_HISTORY_MS))))
    .orderBy(asc(n.startsAt));
  return rows.map((r) => calendarEvent(r.night));
}

/** How many of someone's events are still to come */
export const upcomingCount = (events: CalendarEvent[]) => events.filter((e) => !e.cancelled && e.startsAt.getTime() >= Date.now()).length;

/** A calendar file for a calendar app or browser. Never cached: its address is a secret and its contents change. */
export const calendarResponse = (ics: string, disposition: string) =>
  new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
