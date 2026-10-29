"use server";

import { and, eq, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { CLAUDE_IDEAS_PER_DAY, DEMO, GROUP_NIGHTS, SETTINGS, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { MEEPLE_COLORS, MUST_PLAY_LIMIT, NIGHTS, type Night, POLL_MAX_DATES, RSVP_STATUSES, type RsvpStatus, SENTIMENTS, TIERS, type Tier } from "@/db/enums";
import { claudeReady, pickForNight, recommendPurchases, type NightPicks } from "@/lib/ai";
import { type BggGameDetails, fetchGameDetails, hasBggToken, searchGames } from "@/lib/bgg";
import { canPostToDiscord, deletePlaysMessage, discordCode, editPlaysMessage, fetchAppEmoji, hasInteractions, holdsRole, postPlaysMessage, registerCommands, sendDirectMessage } from "@/lib/discord";
import { type FormattablePlay, type ParsedPlayer, formatPlayMessage } from "@/lib/play-parser";
import { buildPlayMessage } from "@/lib/discord-message";
import { buildGroupContext, buildNightContext } from "@/lib/insights";
import { describeTaste, getRecommendations, getTasteChances } from "@/lib/recommend";
import { PICK_COUNT, askFor, choosePicks } from "@/lib/picks";
import { refreshCatalog } from "@/lib/catalog";
import { type SeatNight, getGameTiers, getPlayerNights } from "@/lib/queries";
import { nightsVersion } from "@/lib/events";
import { replaceTier } from "@/lib/tier";
import { requireAdmin, requireUser } from "@/lib/session";
import { SETTING_KEYS, type SettingKey, checkSettings } from "@/lib/settings";
import { SETTINGS_TAG, saveSettings } from "@/lib/settings-store";
import { zonedToUtc } from "@/lib/nights";
import { answerBringAsk as saveBringAnswer, createNight, deleteNight as removeNight, editNight, ownNight, playerForUser, playerNamed, setRsvp as saveRsvp, titleForGame } from "@/lib/night-store";
import { removePost, syncNightPostLater } from "@/lib/night-post";
import { canWelcome, welcomeName, welcomeToGroup as welcome } from "@/lib/welcome";
import { addPollDate, cancelPoll, createPoll, findNewDate as saveFindNewDate, ownPoll, pickPollDate as savePickedDate, reopenPoll as saveReopened, setPollVote as savePollVote } from "@/lib/poll-store";
import { announcePickedLater, announceRefindLater, syncPollPostLater } from "@/lib/poll-post";
import { escape } from "@/lib/discord-components";
import { nightTitle } from "@/lib/nights";
import { welcomeSummary } from "@/lib/welcome-message";
import { bringAskDm } from "@/lib/bring-message";
import {
  ensureGame,
  findSamePlay,
  normalizeTitle,
  importCollectionCsv,
  rememberDeletedDiscordPlays,
  replacePlay,
  savePlay,
  syncBgaGames,
  syncDiscordPlays,
  syncUserCollection,
  refreshStaleGameDetails,
  upsertGameDetails,
} from "@/lib/sync";

export type ActionResult =
  | { ok: true; message?: string; /** Players it made (someone new on the log form) */ playerIds?: number[] }
  | { ok: false; error: string; duplicate?: boolean };

/**
 * Errors we raise ourselves have readable messages. Anything else (a database or
 * library error) can be long and full of internals, so it's logged for the server
 * logs and people get a plain message instead.
 */
const fail = (err: unknown): ActionResult => {
  const message = err instanceof Error ? err.message : "";
  const internal = !message || message.startsWith("Failed query") || message.length > 200 || /SQLITE_|constraint/i.test(message);
  if (internal) console.error("Action failed", err);
  return { ok: false, error: internal ? "Something went wrong saving that. Try again in a minute." : message };
};

// ---------------------------------------------------------------------------
// Opinions & rankings
// ---------------------------------------------------------------------------

const OpinionPatch = z.object({
  sentiment: z.enum(SENTIMENTS).nullable().optional(),
  wantToPlay: z.boolean().optional(),
  mustPlay: z.boolean().optional(),
  playOnline: z.boolean().optional(),
});

export async function setOpinion(gameId: number, patch: z.infer<typeof OpinionPatch>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = OpinionPatch.parse(patch);
  // Turning a vote on starts its clock: only a play from then on clears it
  const values = {
    ...parsed,
    ...(parsed.wantToPlay !== undefined && { wantToPlaySince: parsed.wantToPlay ? new Date() : null }),
    ...(parsed.mustPlay !== undefined && { mustPlaySince: parsed.mustPlay ? new Date() : null }),
  };
  if (values.mustPlay) {
    const [held] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.opinion)
      .where(and(eq(schema.opinion.userId, me.id), eq(schema.opinion.mustPlay, true), sql`${schema.opinion.gameId} != ${gameId}`));
    if (held.n >= MUST_PLAY_LIMIT) {
      return { ok: false, error: `You've used all ${MUST_PLAY_LIMIT} must-play votes. Take one back first.` };
    }
  }
  await db
    .insert(schema.opinion)
    .values({ userId: me.id, gameId, ...values })
    .onConflictDoUpdate({ target: [schema.opinion.userId, schema.opinion.gameId], set: values });
  refresh();
  return { ok: true };
}

/** Save a member's ranking of one tier's games; their other list stays as it is. */
export async function saveRanking(tier: Tier, gameIds: number[]) {
  const me = await requireUser();
  z.enum(TIERS).parse(tier);
  const ordered = z.array(z.number().int()).max(500).parse([...new Set(gameIds)]);
  const current = (
    await db.select({ gameId: schema.ranking.gameId }).from(schema.ranking).where(eq(schema.ranking.userId, me.id)).orderBy(schema.ranking.position)
  ).map((r) => r.gameId);
  const tiers = await getGameTiers([...new Set([...current, ...ordered])]);
  const inTier = (id: number) => tiers.get(id) === tier;
  // A game that moved to the other tier while this page was open stays where it was
  const ids = replaceTier(current, inTier, ordered.filter(inTier));
  await db.transaction(async (tx) => {
    await tx.delete(schema.ranking).where(eq(schema.ranking.userId, me.id));
    if (ids.length) {
      await tx.insert(schema.ranking).values(ids.map((gameId, position) => ({ userId: me.id, gameId, position })));
    }
  });
  refresh();
}

/** Rank a game with the other tier's games, or (null) let its BGG weight decide again. */
export async function setGameTier(gameId: number, tier: Tier | null): Promise<ActionResult> {
  await requireUser();
  const value = z.enum(TIERS).nullable().parse(tier);
  await db.update(schema.game).set({ tier: value }).where(eq(schema.game.id, gameId));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Plays
// ---------------------------------------------------------------------------

type NightGame = { gameId: number; gameName: string };
type SharedDetails = Omit<FormattablePlay, "games">;

/**
 * The Discord card for a night's games: box art, how often the group has played each, and links back.
 * The casual night's posts don't link here: most of that channel can't sign in.
 */
async function playCard(games: NightGame[], shared: SharedDetails, night: Night, loggedBy?: string) {
  const site = night === "core" ? SITE_URL : undefined;
  const posted = await Promise.all(
    games.map(async ({ gameId, gameName }) => {
      const [g] = await db.select({ image: schema.game.image, thumbnail: schema.game.thumbnail }).from(schema.game).where(eq(schema.game.id, gameId));
      const playNumber = await db.$count(schema.play, and(eq(schema.play.gameId, gameId), lte(schema.play.playedOn, shared.playedOn)));
      return { gameName, bggId: gameId, imageUrl: g?.image ?? g?.thumbnail, playNumber, appUrl: site ? `${site}/games/${gameId}` : null };
    }),
  );
  return buildPlayMessage({ ...shared, games: posted, loggedBy, emoji: await fetchAppEmoji() });
}

/**
 * Rewrite the app's Discord post after one of its plays was edited or deleted: it lists
 * every play still logged against it, or goes away with the last one. Refs are renumbered
 * so they match the order the post now lists the games in.
 */
async function refreshAppPost(messageId: string, night: Night) {
  const plays = (
    await db
      .select()
      .from(schema.play)
      .where(and(eq(schema.play.source, "manual"), like(schema.play.sourceRef, `${messageId}:%`)))
  ).sort((a, b) => Number(a.sourceRef!.split(":")[1]) - Number(b.sourceRef!.split(":")[1]));
  if (plays.length === 0) return deletePlaysMessage(night, messageId);

  for (const [i, p] of plays.entries()) {
    if (p.sourceRef !== `${messageId}:${i}`) await db.update(schema.play).set({ sourceRef: `${messageId}:${i}` }).where(eq(schema.play.id, p.id));
  }
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
  await editPlaysMessage(night, messageId, await playCard(games, shared, night, loggedBy), {
    content: formatPlayMessage({ ...shared, games: games.map((g) => ({ gameName: g.gameName, bggId: g.gameId })) }),
  });
}

/** The log/edit play form, checked. Returns null if something required is missing. */
function readPlayForm(form: FormData) {
  // Each game arrives as its BGG id, whether picked from the list or pasted as a link
  const gameIds = [...new Set(form.getAll("game").map(Number))].filter((id) => Number.isInteger(id) && id > 0).slice(0, 10);
  const playedOn = String(form.get("playedOn") ?? "");
  const playerIds = form.getAll("players").map(Number);
  const names = (field: string) => [...new Set(form.getAll(field).map((g) => String(g).trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))];
  // Guests are matched by name; new guests were said to be someone new though a player has their name
  const guests = names("guests");
  const newGuests = names("newGuests");
  if (gameIds.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || playerIds.length + guests.length + newGuests.length === 0) return null;
  return {
    gameIds,
    playedOn,
    night: (form.get("night") === "casual" ? "casual" : "core") as Night,
    playerIds,
    guests,
    newGuests,
    location: String(form.get("location") ?? "").trim() || undefined,
    notes: String(form.get("notes") ?? "").trim() || undefined,
  };
}

const MISSING_PLAY_FIELDS = "Pick a game (or paste its BGG link), a date, and who played.";

/** The games from the form (fetching any new to us from BGG) and the details they share. */
async function nightFromForm(f: NonNullable<ReturnType<typeof readPlayForm>>) {
  const games: NightGame[] = [];
  for (const id of f.gameIds) {
    const gameId = await ensureGame(id, `BGG #${id}`);
    const [g] = await db.select({ name: schema.game.name }).from(schema.game).where(eq(schema.game.id, gameId));
    games.push({ gameId, gameName: g?.name ?? "Unknown" });
  }
  const players: ParsedPlayer[] = [
    ...(f.playerIds.length ? await db.select().from(schema.player).where(inArray(schema.player.id, f.playerIds)) : []).map((p) => ({
      name: p.name,
      discordId: p.discordId ?? undefined,
      playerId: p.id,
    })),
    ...f.guests.map((name) => ({ name })),
  ];
  const shared = { playedOn: f.playedOn, location: f.location, notes: f.notes, players };
  return { games, shared };
}

/** The night with its new guests made players, once for all its games. Only when it's being saved. */
async function withNewGuests<T extends { players: ParsedPlayer[] }>(shared: T, newGuests: string[]): Promise<T> {
  if (newGuests.length === 0) return shared;
  const made = await db.insert(schema.player).values(newGuests.map((name) => ({ name }))).returning({ id: schema.player.id, name: schema.player.name });
  return { ...shared, players: [...shared.players, ...made.map((p) => ({ name: p.name, playerId: p.id }))] };
}

/** "A", "A and B", "A, B and C" */
const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** Log one game, or a whole night of them with the same date, place and people. */
export async function logPlay(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const f = readPlayForm(form);
  if (!f) return { ok: false, error: MISSING_PLAY_FIELDS };

  try {
    const { games, shared } = await nightFromForm(f);
    const names = listNames(games.map((g) => g.gameName));

    // Catch plays someone already posted in Discord by hand before logging them twice
    if (form.get("allowDuplicate") !== "1") {
      if (canPostToDiscord()) await syncDiscordPlays().catch((err) => console.error("Pre-log Discord sync failed", err));
      const twins = [];
      for (const g of games) {
        const twin = await findSamePlay(g.gameId, shared.playedOn);
        if (twin) twins.push({ ...g, fromDiscord: twin.source === "discord" });
      }
      if (twins.length) {
        return {
          ok: false,
          duplicate: true,
          error: `${listNames(twins.map((t) => t.gameName))} ${twins.length === 1 ? "is" : "are"} already logged for that day${twins.some((t) => t.fromDiscord) ? " (from Discord)" : ""}.`,
        };
      }
    }

    const seated = await withNewGuests(shared, f.newGuests);
    const playIds: number[] = [];
    for (const g of games) {
      const { playId } = await savePlay(
        { ...seated, gameName: g.gameName, bggId: g.gameId },
        { source: "manual", createdBy: me.id, gameId: g.gameId, night: f.night },
      );
      playIds.push(playId);
    }

    let posted = "";
    if (form.get("postToDiscord") === "on" && canPostToDiscord(f.night)) {
      try {
        // One post for the night; each play gets the ref the Discord sync would give it, so the next sync skips them
        const messageId = await postPlaysMessage(f.night, await playCard(games, seated, f.night, me.name));
        for (const [i, playId] of playIds.entries()) {
          await db.update(schema.play).set({ sourceRef: `${messageId}:${i}` }).where(eq(schema.play.id, playId));
        }
        posted = " and posted it to Discord";
      } catch (err) {
        console.error("Posting play to Discord failed", err);
        posted = ", but posting to Discord failed";
      }
    }
    refresh();
    const made = seated.players.flatMap((p) => (p.playerId && !f.playerIds.includes(p.playerId) ? [p.playerId] : []));
    return { ok: true, message: `Logged ${names}${posted}.`, playerIds: made };
  } catch (err) {
    return fail(err);
  }
}

/** Correct a logged play. If the app posted it to Discord, the post is rewritten to match. */
export async function updatePlay(playId: number, form: FormData): Promise<ActionResult> {
  await requireUser();
  const existing = await db.query.play.findFirst({ where: eq(schema.play.id, playId) });
  if (!existing) return { ok: false, error: "That play is gone." };
  const f = readPlayForm(form);
  if (!f) return { ok: false, error: MISSING_PLAY_FIELDS };
  if (f.gameIds.length > 1) return { ok: false, error: "A play is one game. Log the others as new plays." };

  try {
    const { games: [game], shared } = await nightFromForm(f);
    // A play posted in Discord belongs to the night of the channel it's in
    const night = existing.sourceRef ? existing.night : f.night;
    await replacePlay(playId, { ...(await withNewGuests(shared, f.newGuests)), gameName: game.gameName, bggId: game.gameId }, game.gameId, night);

    let discord = "";
    if (existing.source === "manual" && existing.sourceRef && canPostToDiscord(night)) {
      try {
        await refreshAppPost(existing.sourceRef.split(":")[0], night);
        discord = " and updated its Discord post";
      } catch (err) {
        console.error("Editing Discord post failed", err);
        discord = ", but updating its Discord post failed";
      }
    }
    refresh();
    return { ok: true, message: `Saved ${game.gameName}${discord}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePlay(id: number) {
  await requireUser();
  const [deleted] = await db.delete(schema.play).where(eq(schema.play.id, id)).returning();
  if (deleted?.source === "discord") await rememberDeletedDiscordPlays([deleted.sourceRef]);
  // Take the play out of the message the app posted for it (or the whole message, if it was the only one)
  if (deleted?.source === "manual" && deleted.sourceRef && canPostToDiscord(deleted.night)) {
    await refreshAppPost(deleted.sourceRef.split(":")[0], deleted.night).catch((err) => console.error("Updating Discord post failed", err));
  }
  refresh();
}

/** Point every unmatched play logged as `gameName` at a BGG game. */
export async function resolveGameName(gameName: string, gameIdOrUrl: string): Promise<ActionResult> {
  await requireUser();
  const id = Number(/(\d+)/.exec(gameIdOrUrl)?.[1]);
  if (!id) return { ok: false, error: "Pick a game or paste a BGG link." };
  try {
    const exists = await db.query.game.findFirst({ where: eq(schema.game.id, id) });
    if (!exists) {
      if (!hasBggToken()) return { ok: false, error: "That game isn't on anyone's shelf yet, and BGG lookups need an API token." };
      await upsertGameDetails(await fetchGameDetails([id]));
    }
    await db
      .update(schema.play)
      .set({ gameId: id, needsReview: false })
      .where(and(eq(schema.play.gameName, gameName), eq(schema.play.needsReview, true)));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function ignoreGameName(gameName: string) {
  await requireUser();
  const deleted = await db
    .delete(schema.play)
    .where(and(eq(schema.play.gameName, gameName), eq(schema.play.needsReview, true)))
    .returning({ sourceRef: schema.play.sourceRef });
  await rememberDeletedDiscordPlays(deleted.map((d) => d.sourceRef));
  refresh();
}

export async function syncDiscordNow(): Promise<ActionResult> {
  await requireUser();
  try {
    const r = await syncDiscordPlays();
    refresh();
    const parts = [`${r.imported + r.needsReview} new plays`];
    if (r.corrected) parts.push(`${r.corrected} corrected`);
    if (r.needsReview) parts.push(`${r.needsReview} need a game match`);
    return { ok: true, message: parts.join(", ") };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function saveBggUsername(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const username = String(form.get("bggUsername") ?? "").trim() || null;
  await db.update(schema.user).set({ bggUsername: username }).where(eq(schema.user.id, me.id));
  if (!username || !hasBggToken()) {
    refresh();
    return { ok: true, message: username ? "Saved. Collections sync once the BGG token is set up." : "Removed." };
  }
  try {
    const entries = await syncUserCollection(me.id, username);
    await refreshStaleGameDetails(120);
    refresh();
    return { ok: true, message: `Synced ${entries.length} games from BGG.` };
  } catch (err) {
    return fail(err);
  }
}

export async function importCsv(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const file = form.get("csv");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose your BGG collection CSV first." };
  if (file.size > 5_000_000) return { ok: false, error: "That file is too big to be a collection export." };
  try {
    const n = await importCollectionCsv(me.id, await file.text());
    refresh();
    return { ok: true, message: `Imported ${n} games.` };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Board Game Arena
// ---------------------------------------------------------------------------

export async function saveBgaProfile(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const username = String(form.get("bgaUsername") ?? "").trim() || null;
  if (username && username.length > 40) return { ok: false, error: "That's longer than a BGA name can be." };
  const premium = Boolean(username) && form.get("bgaPremium") === "on";
  await db.update(schema.user).set({ bgaUsername: username, bgaPremium: premium }).where(eq(schema.user.id, me.id));
  refresh();
  return { ok: true, message: username ? "Saved." : "Removed." };
}

/** Load BGA's game list now rather than waiting for the nightly sync. */
export async function loadBgaGames(): Promise<ActionResult> {
  await requireUser();
  try {
    const { games } = await syncBgaGames();
    refresh();
    return { ok: true, message: `Loaded ${games} games from Board Game Arena.` };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Group settings and admins
// ---------------------------------------------------------------------------

export type GroupSettingsResult = ActionResult | { ok: false; error: string; fields: Partial<Record<SettingKey, string>> };

/** Save Group settings. Fields the form didn't show (the casual night's, with it off) keep what they were. */
export async function saveGroupSettings(_prev: GroupSettingsResult | null, form: FormData): Promise<GroupSettingsResult> {
  try {
    const me = await requireAdmin();
    const input = Object.fromEntries(SETTING_KEYS.filter((key) => form.has(key)).map((key) => [key, form.get(key)]));
    const checked = checkSettings(input, SETTINGS);
    if (!checked.ok) return { ok: false, error: "Some of those need fixing first.", fields: checked.errors };

    // Signing in needs the member role, so an admin without it would lock themselves out
    const role = checked.settings.memberRole;
    if (role && role !== SETTINGS.memberRole) {
      const row = await db.query.user.findFirst({ where: eq(schema.user.id, me.id), columns: { discordId: true } });
      if (row?.discordId && !(await holdsRole(row.discordId, role))) {
        return { ok: false, error: "Some of those need fixing first.", fields: { memberRole: "You don't have this role, so you couldn't sign in again. Take it in Discord first." } };
      }
    }

    const welcomeBefore = welcomeName();
    await saveSettings(checked.settings);
    updateTag(SETTINGS_TAG);

    // The Invite to … command on Discord's right-click menu is named for the site or the core night
    if (welcomeName() !== welcomeBefore && canWelcome() && hasInteractions()) {
      try {
        await registerCommands(welcomeName());
      } catch (err) {
        console.error("Couldn't rename the Invite command", err);
        return { ok: true, message: "Saved. Discord's right-click Invite command kept its old name: run pnpm discord:commands to rename it." };
      }
    }
    return { ok: true, message: "Saved." };
  } catch (err) {
    return fail(err);
  }
}

/** Make a member an admin, or stop them being one. The last admin stays one, so the settings never fall open by accident. */
export async function setAdmin(userId: string, admin: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!admin) {
      const admins = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.isAdmin, true));
      if (admins.length === 1 && admins[0].id === userId) return { ok: false, error: "Make someone else an admin first." };
    }
    const [row] = await db.update(schema.user).set({ isAdmin: admin }).where(eq(schema.user.id, userId)).returning({ name: schema.user.name });
    if (!row) return { ok: false, error: "They aren't a member." };
    refresh();
    return { ok: true, message: admin ? `${row.name} is an admin.` : `${row.name} isn't an admin anymore.` };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function setMyColor(color: string) {
  const me = await requireUser();
  const c = z.enum(MEEPLE_COLORS).parse(color);
  if (!me.playerId) return;
  await db.update(schema.player).set({ color: c }).where(eq(schema.player.id, me.playerId));
  refresh();
}

/** Tie a player to a Discord account so posts from the app can @-tag them. */
export async function setPlayerDiscord(playerId: number, discordId: string | null): Promise<ActionResult> {
  await requireUser();
  const id = discordId?.trim() || null;
  if (id && !/^\d{15,21}$/.test(id)) return { ok: false, error: "That doesn't look like a Discord user id." };
  const p = await db.query.player.findFirst({ where: eq(schema.player.id, playerId) });
  if (!p) return { ok: false, error: "Player not found." };
  if (p.userId) return { ok: false, error: "Members are linked automatically when they sign in." };
  if (id) {
    const other = await db.query.player.findFirst({ where: eq(schema.player.discordId, id) });
    if (other && other.id !== playerId) return { ok: false, error: `That account is already linked to ${other.name}. Merge the two instead.` };
  }
  await db.update(schema.player).set({ discordId: id }).where(eq(schema.player.id, playerId));
  refresh();
  return { ok: true };
}

/** Fold one player into another — for "Sammy" vs "Sam" in old logs, or claiming yourself. */
/** Members rename themselves; anyone can tidy up a non-member's name. */
export async function renamePlayer(playerId: number, rawName: string): Promise<ActionResult> {
  const me = await requireUser();
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { ok: false, error: "Enter a name." };
  const target = await db.query.player.findFirst({ where: eq(schema.player.id, playerId) });
  if (!target) return { ok: false, error: "Player not found." };
  if (target.userId && target.userId !== me.id) return { ok: false, error: `Only ${target.name} can rename themselves.` };

  // Two people can share a name; the site tells them apart by when each started playing
  const clash = await db.query.player.findFirst({
    where: sql`lower(${schema.player.name}) = ${name.toLowerCase()} and ${schema.player.id} != ${playerId}`,
  });

  await db
    .update(schema.player)
    .set({
      name,
      // Old play logs that use the previous name still match this person
      aliases: [...new Set([...target.aliases, target.name.toLowerCase()])].filter((a) => a !== name.toLowerCase()),
    })
    .where(eq(schema.player.id, playerId));
  if (target.userId) {
    // Saving their own name, even unchanged, is the first step of getting set up
    await db
      .update(schema.user)
      .set({ name, ...(target.userId === me.id && { nameChosenAt: new Date() }) })
      .where(eq(schema.user.id, target.userId));
  }
  refresh();
  return { ok: true, message: `${name === target.name ? "Saved" : `Renamed to ${name}`}.${clash ? sharedName(clash.name) : ""}` };
}

const sharedName = (name: string) =>
  ` Someone else is called ${name} too: lists say when each started playing. If they're the same person, merge them.`;

/** The nights a player is in the plays for, for splitting off the ones that were someone else */
export async function playerNightsFor(playerId: number): Promise<SeatNight[]> {
  await requireUser();
  return getPlayerNights(Number(playerId));
}

/**
 * Two people logged under one name: the nights picked (`night:date` keys) become a new player's,
 * with their plays and their answers for those nights. The undo for a name matched to the
 * wrong person.
 */
export async function splitPlayer(fromId: number, nightKeys: string[], rawName: string): Promise<ActionResult> {
  await requireUser();
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { ok: false, error: "Give the other person's name." };
  const from = await db.query.player.findFirst({ where: eq(schema.player.id, fromId) });
  if (!from) return { ok: false, error: "Player not found." };
  const nights = await getPlayerNights(from.id);
  const picked = nights.filter((n) => nightKeys.includes(n.key));
  if (picked.length === 0) return { ok: false, error: "Tick the nights that were someone else." };
  if (picked.length === nights.length) return { ok: false, error: `That's every night ${from.name} played. Rename them instead.` };

  const clash = await db.query.player.findFirst({ where: sql`lower(${schema.player.name}) = ${name.toLowerCase()}` });
  const onPicked = (dateColumn: string) =>
    sql.join(picked.map((n) => sql`(night = ${n.night} and ${sql.raw(dateColumn)} = ${n.playedOn})`), sql` or `);
  await db.transaction(async (tx) => {
    const [other] = await tx.insert(schema.player).values({ name }).returning({ id: schema.player.id });
    await tx.run(sql`
      update play_player set player_id = ${other.id}, ambiguous_name = null
      where player_id = ${from.id} and play_id in (select id from play where ${onPicked("played_on")})`);
    await tx.run(sql`
      update night_rsvp set player_id = ${other.id}
      where player_id = ${from.id} and game_night_id in (select id from game_night where ${onPicked("date")})`);
  });
  refresh();
  return {
    ok: true,
    message: `${picked.length === 1 ? "That night is" : `Those ${picked.length} nights are`} the new ${name}'s now.${clash ? sharedName(clash.name) : ""}`,
  };
}

/**
 * Say who a name two players share was on a night ("Which Lee?"): every game that night with
 * that name is theirs.
 */
export async function settleWhich(night: Night, playedOn: string, name: string, playerId: number): Promise<ActionResult> {
  await requireUser();
  const to = await db.query.player.findFirst({ where: eq(schema.player.id, playerId) });
  if (!to) return { ok: false, error: "Pick who it was." };
  const seats = await db
    .select({ playId: schema.playPlayer.playId, playerId: schema.playPlayer.playerId })
    .from(schema.playPlayer)
    .innerJoin(schema.play, eq(schema.play.id, schema.playPlayer.playId))
    .where(and(eq(schema.play.night, night), eq(schema.play.playedOn, playedOn), sql`lower(${schema.playPlayer.ambiguousName}) = ${name.toLowerCase()}`));
  await db.transaction(async (tx) => {
    for (const seat of seats) {
      const where = and(eq(schema.playPlayer.playId, seat.playId), eq(schema.playPlayer.playerId, seat.playerId));
      // Already at that play under their own name: one seat is enough
      const there = seat.playerId !== to.id && (await tx.query.playPlayer.findFirst({ where: and(eq(schema.playPlayer.playId, seat.playId), eq(schema.playPlayer.playerId, to.id)) }));
      if (there) await tx.delete(schema.playPlayer).where(where);
      else await tx.update(schema.playPlayer).set({ playerId: to.id, ambiguousName: null }).where(where);
    }
  });
  refresh();
  return { ok: true, message: `That was ${to.name}.` };
}

export async function mergePlayers(fromId: number, intoId: number): Promise<ActionResult> {
  await requireUser();
  if (fromId === intoId) return { ok: false, error: "Pick two different players." };
  const [from, into] = await Promise.all([
    db.query.player.findFirst({ where: eq(schema.player.id, fromId) }),
    db.query.player.findFirst({ where: eq(schema.player.id, intoId) }),
  ]);
  if (!from || !into) return { ok: false, error: "Player not found." };
  if (from.userId && into.userId) return { ok: false, error: "Both players are signed-in members; they can't be merged." };

  await db.transaction(async (tx) => {
    // Seats where both appear in the same play would collide on the primary key
    await tx.run(sql`
      delete from play_player where player_id = ${fromId}
      and play_id in (select play_id from play_player where player_id = ${intoId})`);
    await tx.update(schema.playPlayer).set({ playerId: intoId }).where(eq(schema.playPlayer.playerId, fromId));
    // Dates they said work for them; one both already said works stays as it is
    await tx.run(sql`update or ignore date_poll_vote set player_id = ${intoId} where player_id = ${fromId}`);
    await tx.delete(schema.player).where(eq(schema.player.id, fromId));
    await tx
      .update(schema.player)
      .set({
        aliases: [...new Set([...into.aliases, ...from.aliases, from.name.toLowerCase()])],
        userId: into.userId ?? from.userId,
        color: into.color ?? from.color,
        discordId: into.discordId ?? from.discordId,
        welcomedAt: into.welcomedAt ?? from.welcomedAt,
        welcomedBy: into.welcomedBy ?? from.welcomedBy,
      })
      .where(eq(schema.player.id, intoId));
  });
  refresh();
  return { ok: true, message: `Merged ${from.name} into ${into.name}.` };
}

/** Bring someone from the Discord server into the group: the member role, a hello and a DM with how to get set up */
export async function welcomeToGroup(discordId: string): Promise<ActionResult> {
  const me = await requireUser();
  const id = z.string().regex(/^\d{15,20}$/).safeParse(discordId);
  if (!id.success) return { ok: false, error: "Pick someone from the list." };
  try {
    const row = await db.query.user.findFirst({ where: eq(schema.user.id, me.id), columns: { discordId: true } });
    const result = await welcome(id.data, { name: me.name, userId: me.id, discordId: row?.discordId ?? null });
    refresh();
    return { ok: true, message: welcomeSummary(result, () => "Discord") };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

// Nights: they change here or in Discord, and their posts follow

const NightInput = z.object({
  night: z.enum(NIGHTS),
  title: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().trim().max(200).nullable(),
});

export async function addNight(input: z.infer<typeof NightInput>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = NightInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "It needs a name, a date and a time." };
  const { night, title, date, time, location } = parsed.data;
  let id: number;
  try {
    ({ id } = await createNight({ night, title, startsAt: zonedToUtc(date, time, TIME_ZONE), location }, me.id));
    // Not marked going, but added to the thread to follow it
    syncNightPostLater(id, { creator: await playerForUser(me) });
  } catch (err) {
    return fail(err);
  }
  redirect(`/events/${id}`);
}

export async function updateNight(id: number, input: z.infer<typeof NightInput>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = NightInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "It needs a name, a date and a time." };
  try {
    const { night, title, date, time, location } = parsed.data;
    const before = await editNight(id, { night, title, startsAt: zonedToUtc(date, time, TIME_ZONE), location });
    const discordId = (await db.query.user.findFirst({ where: eq(schema.user.id, me.id), columns: { discordId: true } }))?.discordId;
    syncNightPostLater(id, { note: { before, by: { name: me.name, discordId } } });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteNight(id: number): Promise<ActionResult> {
  await requireUser();
  try {
    const n = await removeNight(id);
    after(() => removePost(n).catch((err) => console.error("Couldn't take the night's post down", err)));
  } catch (err) {
    return fail(err);
  }
  redirect("/plan");
}

// Polls to find a date for a night: they change here or in Discord, and their posts follow

const DateTime = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) });

const PollInput = z.object({
  night: z.enum(NIGHTS),
  title: z.string().trim().max(100),
  location: z.string().trim().max(200).nullable(),
  dates: z.array(DateTime).min(1).max(POLL_MAX_DATES),
});

/** How the thread names me: a mention when I'm linked to Discord */
async function mentionMe(me: { id: string; name: string }) {
  const discordId = (await db.query.user.findFirst({ where: eq(schema.user.id, me.id), columns: { discordId: true } }))?.discordId;
  return discordId ? `<@${discordId}>` : `**${escape(me.name)}**`;
}

export async function startPoll(input: z.infer<typeof PollInput>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = PollInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Give between one and ${POLL_MAX_DATES} dates, each with a time.` };
  const { night, title, location, dates } = parsed.data;
  try {
    const row = await createPoll({ night: GROUP_NIGHTS.includes(night) ? night : "core", title: title || null, location, dates: dates.map((d) => zonedToUtc(d.date, d.time, TIME_ZONE)) }, me.id);
    syncPollPostLater(row.id, { creator: await playerForUser(me) });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/** Say one of a poll's dates works for me, or take it back */
export async function setPollVote(optionId: number, on: boolean): Promise<ActionResult> {
  const me = await requireUser();
  try {
    const playerId = await playerForUser(me);
    const { pollId } = await savePollVote(optionId, playerId, on);
    syncPollPostLater(pollId, on ? { join: playerId } : {});
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

export async function suggestPollDate(pollId: number, input: z.infer<typeof DateTime>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = DateTime.safeParse(input);
  if (!parsed.success) return { ok: false, error: "It needs a date and a time." };
  try {
    const startsAt = zonedToUtc(parsed.data.date, parsed.data.time, TIME_ZONE);
    await addPollDate(pollId, startsAt);
    syncPollPostLater(pollId, { note: `📅 ${await mentionMe(me)} suggested <t:${Math.floor(startsAt.getTime() / 1000)}:F>.` });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

const NewDates = z.array(DateTime).max(POLL_MAX_DATES);

/** A night whose date fell through goes back to a poll for a new one, keeping its games for the pick */
export async function findNewDate(nightId: number, dates: z.infer<typeof NewDates>): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = NewDates.safeParse(dates);
  if (!parsed.success) return { ok: false, error: `Give up to ${POLL_MAX_DATES} dates, each with a time.` };
  let pollId: number;
  try {
    const found = await saveFindNewDate(nightId, parsed.data.map((d) => zonedToUtc(d.date, d.time, TIME_ZONE)), me.id);
    pollId = found.pollId;
    announceRefindLater(pollId, { by: await mentionMe(me), was: found.was.toISOString(), going: found.going, games: found.games });
  } catch (err) {
    return fail(err);
  }
  redirect(`/plan#poll-${pollId}`);
}

/** Pick one of a poll's dates: the night's made (its post is the poll's, once it's posted) and its page opens */
export async function pickPollDate(pollId: number, optionId: number, input: { title: string; location: string | null }): Promise<ActionResult> {
  const me = await requireUser();
  let id: number;
  try {
    const poll = await ownPoll(pollId);
    const option = await db.query.datePollOption.findFirst({ where: and(eq(schema.datePollOption.id, optionId), eq(schema.datePollOption.pollId, pollId)) });
    if (!option) return { ok: false, error: "Pick a date from the list." };
    const title = input.title.trim().slice(0, 100) || nightTitle(poll.night, option.startsAt.toLocaleDateString("en-CA", { timeZone: TIME_ZONE }));
    const location = input.location?.trim().slice(0, 200) || null;
    ({ night: { id } } = await savePickedDate(pollId, optionId, { title, location }, me.id));
    announcePickedLater(pollId, optionId, { playerId: await playerForUser(me) });
  } catch (err) {
    return fail(err);
  }
  redirect(`/events/${id}`);
}

export async function callOffPoll(pollId: number): Promise<ActionResult> {
  const me = await requireUser();
  try {
    await cancelPoll(pollId);
    syncPollPostLater(pollId, { note: `❌ ${await mentionMe(me)} called it off.` });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/** Open a poll that was called off again, votes and all */
export async function reopenPoll(pollId: number): Promise<ActionResult> {
  const me = await requireUser();
  try {
    await saveReopened(pollId);
    syncPollPostLater(pollId, { note: `↩️ ${await mentionMe(me)} reopened it.` });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/** What the open page compares to notice changes made elsewhere (in Discord, or by someone else) */
export async function getNightsVersion(nightId?: number): Promise<string> {
  await requireUser();
  return nightsVersion(Number.isInteger(nightId) ? nightId : undefined);
}

/**
 * Someone's answer for a night Boardroom runs: mine, or anyone's (there are no admins, so
 * anyone can say a member told them in chat), or someone new by `name`, who needn't be in
 * Discord yet (`isNew` when a player has that name already and it's someone else). `status`
 * null takes the answer back.
 */
export async function setRsvp(
  nightId: number,
  status: RsvpStatus | null,
  opts: { guests?: number; playerId?: number; name?: string; isNew?: boolean } = {},
): Promise<ActionResult> {
  const me = await requireUser();
  if (status !== null && !RSVP_STATUSES.includes(status)) return { ok: false, error: "Pick going, maybe or can't." };
  try {
    const playerId =
      opts.playerId ?? (opts.name !== undefined ? await playerNamed(String(opts.name), { isNew: opts.isNew === true }) : await playerForUser(me));
    await saveRsvp({ nightId, playerId, status, guests: opts.guests, via: "site" });
    syncNightPostLater(nightId, { join: playerId });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/** Others coming to a night added here who aren't named, counted by hand */
export async function setOthersComing(id: number, others: number): Promise<ActionResult> {
  await requireUser();
  try {
    const n = await ownNight(id);
    await db.update(schema.gameNight).set({ guests: Math.max(0, Math.min(20, Math.trunc(others) || 0)) }).where(eq(schema.gameNight.id, n.id));
    syncNightPostLater(n.id);
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/**
 * Put a game on a night. On a core night it's a proposal, with the proposer's vote; on a
 * casual night it's on the bring list, with me bringing my copy.
 */
export async function addGameToNight(nightId: number, gameId: number): Promise<ActionResult> {
  const me = await requireUser();
  const n = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) });
  if (!n) return { ok: false, error: "That event is gone." };
  const existing = await db.query.gamePlan.findFirst({
    where: and(eq(schema.gamePlan.gameNightId, n.id), eq(schema.gamePlan.gameId, gameId)),
  });

  if (n.night === "core") {
    const planId =
      existing?.id ??
      (await db.insert(schema.gamePlan).values({ gameId, night: n.night, gameNightId: n.id, createdBy: me.id }).returning({ id: schema.gamePlan.id }))[0].id;
    await db.insert(schema.planVote).values({ planId, userId: me.id }).onConflictDoNothing();
    syncNightPostLater(n.id);
    refresh();
    return { ok: true, message: existing ? "Already proposed. Your vote's on it." : "Proposed." };
  }

  if (existing?.bringerId && existing.bringerId !== me.id) {
    const other = await db.query.user.findFirst({ where: eq(schema.user.id, existing.bringerId) });
    return { ok: false, error: `${other?.name ?? "Someone"}'s already bringing it.` };
  }
  // Only a copy someone has can come
  if (!(await owns(me.id, gameId))) return { ok: false, error: "You don't own it. Ask someone who does to bring it." };
  // Saying I'll bring mine answers anyone else's ask
  if (existing) await db.update(schema.gamePlan).set({ bringerId: me.id, askedId: null }).where(eq(schema.gamePlan.id, existing.id));
  else await db.insert(schema.gamePlan).values({ gameId, night: n.night, gameNightId: n.id, bringerId: me.id, createdBy: me.id });
  syncNightPostLater(n.id);
  refresh();
  return { ok: true, message: "On the bring list." };
}

async function owns(userId: string, gameId: number) {
  const copy = await db.query.collectionItem.findFirst({
    where: and(eq(schema.collectionItem.userId, userId), eq(schema.collectionItem.gameId, gameId), eq(schema.collectionItem.own, true)),
  });
  return Boolean(copy);
}

/**
 * Ask someone who owns a game to bring it to a casual night. It goes on the bring list as
 * asked, and they get a DM with buttons to answer (or answer on the event's page).
 */
export async function askToBring(nightId: number, gameId: number, ownerId: string): Promise<ActionResult> {
  const me = await requireUser();
  const [n, owner, g, existing] = await Promise.all([
    db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) }),
    db.query.user.findFirst({ where: eq(schema.user.id, ownerId) }),
    db.query.game.findFirst({ where: eq(schema.game.id, gameId), columns: { name: true } }),
    db.query.gamePlan.findFirst({ where: and(eq(schema.gamePlan.gameNightId, nightId), eq(schema.gamePlan.gameId, gameId)) }),
  ]);
  if (!n || n.night !== "casual" || !g) return { ok: false, error: "That event is gone." };
  if (!owner || !(await owns(owner.id, gameId))) return { ok: false, error: `${owner?.name ?? "That person"} doesn't own it.` };
  if (owner.id === me.id) return addGameToNight(nightId, gameId);
  if (existing?.bringerId) {
    const other = await db.query.user.findFirst({ where: eq(schema.user.id, existing.bringerId) });
    return { ok: false, error: `${other?.name ?? "Someone"}'s already bringing it.` };
  }
  if (existing?.askedId) {
    const other = await db.query.user.findFirst({ where: eq(schema.user.id, existing.askedId) });
    return { ok: false, error: `${other?.name ?? "Someone"}'s already been asked.` };
  }
  const planId = existing
    ? (await db.update(schema.gamePlan).set({ askedId: owner.id, createdBy: me.id }).where(eq(schema.gamePlan.id, existing.id)).returning({ id: schema.gamePlan.id }))[0].id
    : (await db.insert(schema.gamePlan).values({ gameId, night: n.night, gameNightId: n.id, askedId: owner.id, createdBy: me.id }).returning({ id: schema.gamePlan.id }))[0].id;
  syncNightPostLater(n.id);
  refresh();

  // Without the bot (or their Discord account), they'll see it on the event's page
  if (!owner.discordId || !process.env.DISCORD_BOT_TOKEN || !hasInteractions()) {
    return { ok: true, message: `Asked ${owner.name}. They'll see it on the event's page.` };
  }
  try {
    await sendDirectMessage(
      owner.discordId,
      bringAskDm({ planId, game: g.name, night: { title: n.title, startsAt: n.startsAt.toISOString() }, by: me.name, url: SITE_URL ? `${SITE_URL}/events/${n.id}` : null }),
    );
    return { ok: true, message: `Asked ${owner.name}. They've got a DM to answer.` };
  } catch (err) {
    if (discordCode(err) !== 50007) console.error(`Couldn't DM ${owner.id} about bringing ${gameId}`, err);
    const why = discordCode(err) === 50007 ? "they don't take DMs" : "the DM didn't go through";
    return { ok: true, message: `Asked ${owner.name}, but ${why}, so give them a nudge.` };
  }
}

/** My answer to being asked to bring a game, on the event's page */
export async function answerBringAsk(planId: number, yes: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const answered = await saveBringAnswer(planId, me.id, yes);
  if (!answered) return { ok: false, error: "That's not open anymore." };
  syncNightPostLater(answered.nightId);
  refresh();
  return { ok: true };
}

/** "I'd play this" on a core night's proposal */
export async function setPlanVote(planId: number, on: boolean) {
  const me = await requireUser();
  if (on) await db.insert(schema.planVote).values({ planId, userId: me.id }).onConflictDoNothing();
  else await db.delete(schema.planVote).where(and(eq(schema.planVote.planId, planId), eq(schema.planVote.userId, me.id)));
  await syncPlanNight(planId);
  refresh();
}

/** A plan's night gets its post updated: proposals, votes, the locked-in game and the bring list are on it */
async function syncPlanNight(planId: number) {
  const plan = await db.query.gamePlan.findFirst({ where: eq(schema.gamePlan.id, planId), columns: { gameNightId: true } });
  if (plan?.gameNightId) syncNightPostLater(plan.gameNightId);
}

/** Lock in a core night's game (one per night), or unlock it */
export async function choosePlan(planId: number, chosen: boolean) {
  await requireUser();
  const plan = await db.query.gamePlan.findFirst({ where: eq(schema.gamePlan.id, planId) });
  if (!plan?.gameNightId) return;
  await db.transaction(async (tx) => {
    if (chosen) await tx.update(schema.gamePlan).set({ chosen: false }).where(eq(schema.gamePlan.gameNightId, plan.gameNightId!));
    await tx.update(schema.gamePlan).set({ chosen }).where(eq(schema.gamePlan.id, plan.id));
  });
  syncNightPostLater(plan.gameNightId, { renamed: await titleForGame(plan.gameNightId) });
  refresh();
}

async function dropPlanRows(ids: number[]) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.planVote).where(inArray(schema.planVote.planId, ids));
    await tx.delete(schema.planReady).where(inArray(schema.planReady.planId, ids));
    await tx.delete(schema.gamePlan).where(inArray(schema.gamePlan.id, ids));
  });
}

/** On a demo, a link one visitor adds is one every visitor sees until the reset, so prep links stay as seeded */
const DEMO_LINKS = "You can't add or remove prep links on the demo.";

export async function addPrepLink(id: number, rawUrl: string, rawLabel: string): Promise<ActionResult> {
  await requireUser();
  if (DEMO) return { ok: false, error: DEMO_LINKS };
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  const plan = await db.query.gamePlan.findFirst({ where: eq(schema.gamePlan.id, id) });
  if (!plan) return { ok: false, error: "That plan is gone." };
  const label = rawLabel.trim().slice(0, 80) || url.hostname.replace(/^www\./, "");
  await db.update(schema.gamePlan).set({ links: [...plan.links, { label, url: url.toString() }] }).where(eq(schema.gamePlan.id, id));
  refresh();
  return { ok: true };
}

export async function removePrepLink(id: number, url: string) {
  await requireUser();
  if (DEMO) throw new Error(DEMO_LINKS);
  const plan = await db.query.gamePlan.findFirst({ where: eq(schema.gamePlan.id, id) });
  if (!plan) return;
  await db.update(schema.gamePlan).set({ links: plan.links.filter((l) => l.url !== url) }).where(eq(schema.gamePlan.id, id));
  refresh();
}

export async function setPrepped(planId: number, ready: boolean) {
  const me = await requireUser();
  if (ready) await db.insert(schema.planReady).values({ planId, userId: me.id }).onConflictDoNothing();
  else await db.delete(schema.planReady).where(and(eq(schema.planReady.planId, planId), eq(schema.planReady.userId, me.id)));
  refresh();
}

/** Take a game off a night: a proposal withdrawn, or no longer bringing it */
export async function dropPlan(id: number) {
  await requireUser();
  const plan = await db.query.gamePlan.findFirst({ where: eq(schema.gamePlan.id, id), columns: { gameNightId: true, chosen: true } });
  await dropPlanRows([id]);
  // Dropping the locked-in game unlocks it, which a title with the game in it follows
  if (plan?.gameNightId) syncNightPostLater(plan.gameNightId, { renamed: plan.chosen && (await titleForGame(plan.gameNightId)) });
  refresh();
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export async function askClaudeForNight(input: {
  night: Night;
  presentUserIds: string[];
  others: number;
  minutes: number | null;
  candidateIds: number[];
}): Promise<{ ok: true; picks: NightPicks } | { ok: false; error: string }> {
  await requireUser();
  if (!claudeReady()) return { ok: false, error: "Claude's picks are off. An admin can turn them on in Group settings, once the site has an ANTHROPIC_API_KEY." };
  const night: Night = input.night === "casual" ? "casual" : "core";
  try {
    const context = await buildNightContext({ ...input, night, others: Math.max(0, Math.min(20, Math.trunc(input.others) || 0)) });
    return { ok: true, picks: await pickForNight(context, night) };
  } catch (err) {
    return fail(err) as { ok: false; error: string };
  }
}

/** Fill the discovery catalog now rather than waiting for the nightly sync. */
export async function loadCatalog(): Promise<ActionResult> {
  await requireUser();
  if (!hasBggToken()) return { ok: false, error: "This needs the site's BGG API token." };
  try {
    const { hot, top } = await refreshCatalog();
    refresh();
    return { ok: true, message: `Loaded ${hot + top} games from BGG.` };
  } catch (err) {
    return fail(err);
  }
}

/** "I'd buy this": puts a game on the buy list with my vote. */
export async function wantGame(gameId: number): Promise<ActionResult> {
  const me = await requireUser();
  const g = await db.query.game.findFirst({ where: eq(schema.game.id, gameId) });
  if (!g) return { ok: false, error: "Game not found." };
  let s = await db.query.suggestion.findFirst({ where: eq(schema.suggestion.bggId, gameId) });
  if (!s) {
    [s] = await db
      .insert(schema.suggestion)
      .values({ name: g.name, year: g.year, bggId: g.id, thumbnail: g.thumbnail, source: "member", addedBy: me.id })
      .onConflictDoUpdate({ target: schema.suggestion.name, set: { bggId: g.id, dismissed: false } })
      .returning();
  } else if (s.dismissed) {
    await db.update(schema.suggestion).set({ dismissed: false }).where(eq(schema.suggestion.id, s.id));
  }
  await db
    .insert(schema.suggestionVote)
    .values({ suggestionId: s.id, userId: me.id, value: 1 })
    .onConflictDoUpdate({ target: [schema.suggestionVote.suggestionId, schema.suggestionVote.userId], set: { value: 1 } });
  refresh();
  return { ok: true, message: `${g.name} is on the buy list.` };
}

/**
 * Take back my "Want it". Once nobody wants a game someone put on the buy list, it comes off;
 * a Claude pick stays in Claude's list, which it only left the buy list for.
 */
export async function unwantGame(gameId: number): Promise<ActionResult> {
  const me = await requireUser();
  const s = await db.query.suggestion.findFirst({ where: eq(schema.suggestion.bggId, gameId) });
  if (!s) return { ok: true };
  await db.delete(schema.suggestionVote).where(and(eq(schema.suggestionVote.suggestionId, s.id), eq(schema.suggestionVote.userId, me.id)));
  const stillWanted = await db.$count(schema.suggestionVote, and(eq(schema.suggestionVote.suggestionId, s.id), eq(schema.suggestionVote.value, 1)));
  if (!stillWanted && s.source === "member") await db.update(schema.suggestion).set({ dismissed: true }).where(eq(schema.suggestion.id, s.id));
  refresh();
  return { ok: true, message: stillWanted ? "Your vote's off it." : "Off the buy list." };
}

/**
 * Take a game off the buy list for everyone: its votes go, and one someone added comes off
 * the list. A Claude pick stays in Claude's list, which is where it came from.
 */
export async function takeOffBuyList(suggestionId: number): Promise<ActionResult> {
  await requireUser();
  const s = await db.query.suggestion.findFirst({ where: eq(schema.suggestion.id, suggestionId) });
  if (!s) return { ok: true };
  await db.transaction(async (tx) => {
    await tx.delete(schema.suggestionVote).where(eq(schema.suggestionVote.suggestionId, s.id));
    if (s.source === "member") await tx.update(schema.suggestion).set({ dismissed: true }).where(eq(schema.suggestion.id, s.id));
  });
  refresh();
  return { ok: true, message: `${s.name} is off the buy list.` };
}

/**
 * Ask Claude for a fresh list of picks, for the group on one night or just for me. Each one is
 * checked on BGG and scored against everyone's current ratings and rankings, and the most
 * confident replace the list. Earlier picks someone wanted stay on the buy list.
 */
export async function askClaudeForPicks(scope: "group" | "me", nightInput: Night = "core"): Promise<ActionResult> {
  const me = await requireUser();
  if (!claudeReady()) return { ok: false, error: "Claude's picks are off. An admin can turn them on in Group settings, once the site has an ANTHROPIC_API_KEY." };
  if (!hasBggToken()) return { ok: false, error: "Picks need the BGG API token, so each one can be checked and scored." };
  try {
    // A cap per person per day: each run is a large request to Claude
    const capKey = `claude-ideas:${me.id}:${new Date().toISOString().slice(0, 10)}`;
    const used = Number((await db.query.syncState.findFirst({ where: eq(schema.syncState.key, capKey) }))?.value ?? 0);
    if (used >= CLAUDE_IDEAS_PER_DAY) return { ok: false, error: `That's ${CLAUDE_IDEAS_PER_DAY} asks today. More tomorrow.` };
    await db
      .insert(schema.syncState)
      .values({ key: capKey, value: String(used + 1) })
      .onConflictDoUpdate({ target: schema.syncState.key, set: { value: String(used + 1) } });

    const forUserId = scope === "me" ? me.id : null;
    // One member's list isn't for a particular night; the group has one per night
    const night: Night | null = scope === "me" ? null : nightInput === "casual" ? "casual" : "core";
    const ofThisList = and(
      eq(schema.suggestion.source, "ai"),
      eq(schema.suggestion.dismissed, false),
      forUserId ? eq(schema.suggestion.forUserId, forUserId) : and(isNull(schema.suggestion.forUserId), eq(schema.suggestion.night, night ?? "core")),
    );
    const current = await db.select({ id: schema.suggestion.id, bggId: schema.suggestion.bggId, name: schema.suggestion.name }).from(schema.suggestion).where(ofThisList);

    const rec = await getRecommendations(me.id, me.playerId);
    const context = `${await buildGroupContext({ forPurchases: true, currentPicks: current.map((c) => c.name) })}\n\n${await describeTaste(rec, { forUserId: forUserId ?? undefined, night: night ?? undefined })}`;
    const { recommendations } = await recommendPurchases(context, {
      count: askFor(scope),
      forMember: scope === "me" ? me.name : undefined,
      night: night ?? undefined,
      current: current.map((c) => c.name),
    });

    // Check every id Claude gave in one request; search for the rest (a few, to stay inside BGG's rate limit)
    const claimed = recommendations.filter((r) => r.bggId);
    const details = new Map((await fetchGameDetails(claimed.map((r) => r.bggId!))).map((d) => [d.id, d]));
    let searches = 0;
    const found = new Map<number, { details: BggGameDetails; reason: string }>();
    for (const r of recommendations) {
      let d = r.bggId ? details.get(r.bggId) : undefined;
      if (!d || !sameTitle(d.name, r.name)) {
        if (searches++ >= 6) continue;
        const match = await findOnBgg(r.name, r.year);
        d = match?.details;
      }
      if (d && !found.has(d.id)) found.set(d.id, { details: d, reason: r.reason });
    }
    // Stored so each one can be scored against everyone's taste
    await upsertGameDetails([...found.values()].map((f) => f.details));

    // Score them as Discover does, leaving out anything owned or turned down
    const ids = [...found.keys()];
    const [chances, owned, turnedDown] = await Promise.all([
      getTasteChances(ids),
      ids.length
        ? db.selectDistinct({ id: schema.collectionItem.gameId }).from(schema.collectionItem).where(and(eq(schema.collectionItem.own, true), inArray(schema.collectionItem.gameId, ids)))
        : [],
      ids.length
        ? db
            .selectDistinct({ id: schema.opinion.gameId })
            .from(schema.opinion)
            .where(and(eq(schema.opinion.sentiment, "nope"), inArray(schema.opinion.gameId, ids), forUserId ? eq(schema.opinion.userId, forUserId) : undefined))
        : [],
    ]);
    // A night's list has to seat its usual table and be its kind of game, by weight
    const wrongForTheNight = (d: BggGameDetails) => night !== null && !rec.nights[night].fits(d);
    const excluded = new Set([
      ...[...owned, ...turnedDown].map((r) => r.id),
      ...[...found.values()].filter((f) => wrongForTheNight(f.details)).map((f) => f.details.id),
    ]);
    const chanceOf = (id: number) => {
      const byMember = chances[id] ?? {};
      if (forUserId) return byMember[forUserId] ?? null;
      const all = Object.values(byMember);
      return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    };
    const picks = choosePicks(
      [...found.values()].filter((f) => !excluded.has(f.details.id)).map((f) => ({ ...f, chance: chanceOf(f.details.id) })),
      PICK_COUNT[scope],
    );
    if (!picks.length) return { ok: false, error: "Claude didn't come back with any confident picks this time, so the current ones stay." };

    // Every pick of this ask shares its time, which is how Discover tells the latest list apart
    const askedAt = new Date();
    const existing = new Map(
      (await db.select().from(schema.suggestion).where(inArray(schema.suggestion.bggId, picks.map((p) => p.details.id)))).map((s) => [s.bggId!, s]),
    );
    const kept = new Set<number>();
    let shown = 0;
    for (const { details: d, reason } of picks) {
      const row = existing.get(d.id);
      if (row) {
        // Already somewhere else (the buy list, the other list, or put away): leave it be
        if (row.source !== "ai" || row.forUserId !== forUserId || row.night !== night || row.dismissed) continue;
        await db.update(schema.suggestion).set({ reason, createdAt: askedAt }).where(eq(schema.suggestion.id, row.id));
        kept.add(row.id);
        shown++;
      } else {
        const [added] = await db
          .insert(schema.suggestion)
          .values({ name: d.name, year: d.year, bggId: d.id, thumbnail: d.thumbnail, reason, source: "ai", forUserId, night, createdAt: askedAt })
          .onConflictDoNothing()
          .returning({ id: schema.suggestion.id });
        if (added) shown++;
      }
    }

    // The rest of the old list goes, except picks someone wants: those stay on the buy list
    const dropped = current.filter((c) => !kept.has(c.id)).map((c) => c.id);
    if (dropped.length) {
      const wanted = new Set(
        (await db.selectDistinct({ id: schema.suggestionVote.suggestionId }).from(schema.suggestionVote).where(inArray(schema.suggestionVote.suggestionId, dropped))).map((r) => r.id),
      );
      const unwanted = dropped.filter((id) => !wanted.has(id));
      if (unwanted.length) await db.delete(schema.suggestion).where(inArray(schema.suggestion.id, unwanted));
    }

    refresh();
    return {
      ok: true,
      message: `${shown} ${shown === 1 ? "pick" : "picks"}${kept.size ? `, ${kept.size} kept from last time` : ""}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

const sameTitle = (a: string, b: string) => {
  const [x, y] = [normalizeTitle(a), normalizeTitle(b)];
  return x === y || x.startsWith(y) || y.startsWith(x);
};

async function findOnBgg(name: string, year: number | null) {
  try {
    const hits = await searchGames(name);
    const hit = hits.find((h) => year && h.year === year) ?? hits[0];
    if (!hit) return null;
    const [d] = await fetchGameDetails([hit.id]);
    if (!d) return null;
    // Stored so the game can be scored against everyone's taste
    await upsertGameDetails([d]);
    return { id: hit.id, name: d.name, year: d.year, thumbnail: d.thumbnail, details: d };
  } catch {
    return null;
  }
}

export async function addSuggestion(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Which game?" };
  const match = hasBggToken() ? await findOnBgg(name, null) : null;
  const [row] = await db
    .insert(schema.suggestion)
    .values({
      name: match?.name ?? name,
      year: match?.year,
      bggId: match?.id,
      thumbnail: match?.thumbnail,
      reason,
      source: "member",
      addedBy: me.id,
    })
    .onConflictDoNothing()
    .returning({ id: schema.suggestion.id });
  if (!row) return { ok: false, error: `${match?.name ?? name} is already on the list.` };
  await db.insert(schema.suggestionVote).values({ suggestionId: row.id, userId: me.id, value: 1 });
  refresh();
  return { ok: true, message: `Added ${match?.name ?? name}.` };
}
