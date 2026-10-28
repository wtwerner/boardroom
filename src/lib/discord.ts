import "server-only";
import { CASUAL_NIGHT, SETTINGS } from "@/config";
import type { Night } from "@/db/enums";
import { botCommands } from "./discord-commands";
import { type AppEmoji, appEmoji } from "./icons";
import type { SignInRefusal } from "./sign-in-refusal";

const API = "https://discord.com/api/v10";

export type DiscordUser = {
  id: string;
  username: string;
  global_name: string | null;
  bot?: boolean;
};

export type DiscordMessage = {
  id: string;
  /** In a forum, the post (thread) it's in */
  channel_id?: string;
  content: string;
  timestamp: string;
  /** Set once the message has been edited */
  edited_timestamp?: string | null;
  author: DiscordUser;
  mentions: DiscordUser[];
  /** Components V2 messages (like the app's own play posts) carry their text here, not in content */
  components?: unknown[];
};

type GuildMember = { roles: string[]; nick: string | null; user: DiscordUser };

/** `reason` shows in the server's audit log */
async function discordFetch<T>(path: string, init?: { method: "POST" | "PATCH" | "PUT"; body: unknown } | { method: "DELETE" | "PUT"; reason?: string }): Promise<T | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bot ${token}`,
        ...(init && "body" in init ? { "Content-Type": "application/json" } : {}),
        ...(init && "reason" in init && init.reason ? { "X-Audit-Log-Reason": encodeURIComponent(init.reason) } : {}),
      },
      body: init && "body" in init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (res.status === 429) {
      const body = (await res.json()) as { retry_after?: number };
      await sleep(((body.retry_after ?? 1) + 0.25) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Discord ${path} → ${res.status} ${await res.text()}`);
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }
  throw new Error(`Discord ${path} → rate limited`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The role someone needs to sign in, from Group settings, or null when anyone in the server can */
const memberRole = () => SETTINGS.memberRole;

/**
 * Why this Discord user may not sign in, or null if they may: they must be in the
 * group's server, and hold the member role when Group settings names one.
 */
export async function groupMemberRefusal(discordUserId: string): Promise<SignInRefusal | null> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID is not set");

  const member = await discordFetch<GuildMember>(`/guilds/${guildId}/members/${discordUserId}`);
  if (!member) return "not_in_server";

  const roleId = memberRole();
  return roleId && !member.roles.includes(roleId) ? "missing_role" : null;
}

/** The casual night's channels are only used while the group has one */
const forNight = (night: Night, core: string | null, casual: string | null) => (night === "casual" ? (CASUAL_NIGHT ? casual : null) : core);

/** Each night logs plays in its own channel, set on Group settings: the core group's and, with a casual night, the casual night's */
export function playsChannel(night: Night) {
  return forNight(night, SETTINGS.playsChannel, SETTINGS.casualChannel);
}

function requireChannel(night: Night) {
  const id = playsChannel(night);
  if (!id) throw new Error(`Group settings has no plays channel for ${night === "casual" ? "the casual night" : "the group"}`);
  return id;
}

/**
 * Each kind of night's events channel, set on Group settings. Boardroom posts its nights there,
 * with a thread for each. Either can be a text channel or a forum.
 */
export function eventsChannel(night: Night) {
  return forNight(night, SETTINGS.coreEventsChannel, SETTINGS.casualEventsChannel);
}

/**
 * Where each kind of night is announced, when its events channel is somewhere people don't
 * read as they chat (a forum, say), set on Group settings. The announcement shows the details
 * and links to the post, which has the buttons, and takes the night's ping. Unset, or the events
 * channel itself, there's no announcement.
 */
export function announceChannel(night: Night) {
  const id = forNight(night, SETTINGS.coreAnnounceChannel, SETTINGS.casualAnnounceChannel);
  return id && id !== eventsChannel(night) ? id : null;
}

/** Whether signing in needs a particular role in the server, rather than just being in it */
export const hasMemberRole = () => Boolean(memberRole());

/** Someone in the group's server, with the name the server shows and whether they hold the member role. Null if they aren't in it. */
export async function getServerMember(discordUserId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID is not set");
  const m = await discordFetch<GuildMember>(`/guilds/${guildId}/members/${discordUserId}`);
  if (!m) return null;
  const roleId = memberRole();
  return { id: m.user.id, name: m.nick || displayName(m.user), bot: Boolean(m.user.bot), hasRole: roleId ? m.roles.includes(roleId) : null };
}

/** Whether someone in the group's server holds this role. False when they aren't in it. */
export async function holdsRole(discordUserId: string, roleId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID is not set");
  const m = await discordFetch<GuildMember>(`/guilds/${guildId}/members/${discordUserId}`);
  return Boolean(m?.roles.includes(roleId));
}

/** The member role's name in the server ("Core group"), for messages that say what someone was given */
export async function memberRoleName() {
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = memberRole();
  if (!guildId || !roleId) return null;
  const roles = (await discordFetch<{ id: string; name: string }[]>(`/guilds/${guildId}/roles`)) ?? [];
  return roles.find((r) => r.id === roleId)?.name ?? null;
}

/**
 * Give someone the member role. Needs the bot's role to have Manage Roles and to sit above
 * the member role in Server Settings → Roles.
 */
export async function giveMemberRole(discordUserId: string, reason: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = memberRole();
  if (!guildId || !roleId) throw new Error("Group settings has no member role");
  await discordFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: "PUT", reason });
}

/** Discord's own error code from a failed call ("Missing Permissions" is 50013, "Cannot send messages to this user" 50007) */
export function discordCode(err: unknown) {
  const code = String(err instanceof Error ? err.message : err).match(/"code":\s*(\d+)/)?.[1];
  return code ? Number(code) : null;
}

/** Send someone a direct message. Fails when they don't take DMs from server members. */
export async function sendDirectMessage(discordUserId: string, body: MessageBody) {
  const dm = await discordFetch<{ id: string }>("/users/@me/channels", { method: "POST", body: { recipient_id: discordUserId } });
  if (!dm) throw new Error("Discord didn't open the DM");
  return postMessage(dm.id, body);
}

/**
 * Where someone invited to the core group's nights is greeted: the welcome channel on Group settings, or
 * else the channel the core group's nights are announced in, its events channel (unless that's
 * a forum, which only takes posts), or its plays channel. Never one of the casual night's
 * channels.
 */
export async function welcomeChannel() {
  const casual = new Set([eventsChannel("casual"), announceChannel("casual"), playsChannel("casual")].filter(Boolean));
  const events = eventsChannel("core");
  const eventsTakesMessages = events ? !(await isForumChannel(events).catch(() => true)) : false;
  return [SETTINGS.welcomeChannel, announceChannel("core"), eventsTakesMessages && events, playsChannel("core")].find((id) => id && !casual.has(id)) || null;
}

/**
 * Anyone in the server can sign in, and everyone signed in can delete and merge. Fine for a
 * server that's just the group; worth a warning in a bigger one.
 */
export const anyServerMemberCanSignIn = () => Boolean(process.env.DISCORD_GUILD_ID) && !hasMemberRole();

/**
 * Whether Discord can reach the site with button clicks, slash commands and forms: the
 * application's Interactions Endpoint URL points at /api/discord/interactions, and
 * DISCORD_PUBLIC_KEY is set to check that requests really come from Discord.
 */
export const hasInteractions = () => Boolean(process.env.DISCORD_PUBLIC_KEY);

/**
 * The bot's slash command: DISCORD_COMMAND_NAME (lowercase letters, numbers, - or _), or
 * "event". `/event new`, `/event edit`, `/event cancel`.
 */
export function commandName() {
  const name = process.env.DISCORD_COMMAND_NAME?.trim().toLowerCase();
  return name && /^[a-z0-9_-]{1,32}$/.test(name) ? name : "event";
}

/**
 * Who's pinged when a night of this kind is first posted, set on Group settings: "here",
 * "everyone" or a role id. Unset pings nobody.
 */
export function nightPingSetting(night: Night) {
  return (night === "casual" ? SETTINGS.casualNightPing : SETTINGS.coreNightPing) ?? undefined;
}

/**
 * Whether Boardroom posts this kind of night to its events channel itself, with a thread and
 * buttons to answer. The buttons need interactions, so a group without them isn't sent posts
 * nobody can answer.
 */
export const postsNights = (night: Night) => Boolean(process.env.DISCORD_BOT_TOKEN && hasInteractions() && eventsChannel(night));

export const canPostToDiscord = (night: Night = "core") => Boolean(process.env.DISCORD_BOT_TOKEN && playsChannel(night));

/**
 * Server members, for linking players to Discord accounts. Needs the bot's
 * "Server Members Intent"; returns [] (and the UI falls back) without it.
 */
export async function listGuildMembers(): Promise<{ id: string; name: string; username: string; hasRole: boolean | null }[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return [];
  const roleId = memberRole();
  try {
    const members = (await discordFetch<GuildMember[]>(`/guilds/${guildId}/members?limit=1000`)) ?? [];
    return members
      .filter((m) => !m.user.bot)
      .map((m) => ({ id: m.user.id, name: m.nick || displayName(m.user), username: m.user.username, hasRole: roleId ? m.roles.includes(roleId) : null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Couldn't list Discord members", err);
    return [];
  }
}

export type MessageBody = { content: string; components?: unknown[] } | { flags: number; components: unknown[] };

/** Post to a night's plays channel. Mentions render as names but don't ping anyone. */
export async function postPlaysMessage(night: Night, body: MessageBody): Promise<string> {
  const channelId = requireChannel(night);
  const msg = await discordFetch<DiscordMessage>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: { ...body, allowed_mentions: { parse: [] } },
  });
  if (!msg) throw new Error("Discord rejected the message");
  return msg.id;
}

/**
 * Rewrite a message the bot posted (the bot can only edit its own). Plain-text posts
 * from before the card layout can't be turned into components, so they get `fallback`.
 */
export async function editPlaysMessage(night: Night, messageId: string, body: MessageBody, fallback?: { content: string }) {
  const channelId = requireChannel(night);
  const path = `/channels/${channelId}/messages/${messageId}`;
  const existing = await discordFetch<DiscordMessage & { flags?: number }>(path);
  if (!existing) throw new Error("That Discord message no longer exists");
  const isCard = ((existing.flags ?? 0) & (1 << 15)) !== 0;
  const next = "components" in body && !isCard && fallback ? fallback : body;
  await discordFetch(path, { method: "PATCH", body: { ...next, allowed_mentions: { parse: [] } } });
}

/** Remove a message the bot posted. Already-deleted messages are fine. */
export async function deletePlaysMessage(night: Night, messageId: string) {
  const channelId = requireChannel(night);
  await discordFetch(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
}

/**
 * Every message in a channel posted after `afterId`, oldest first.
 * Pass `"0"` to read the whole history.
 */
export async function fetchChannelMessagesAfter(channelId: string, afterId: string): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let cursor = afterId;
  for (;;) {
    const page =
      (await discordFetch<DiscordMessage[]>(
        `/channels/${channelId}/messages?after=${cursor}&limit=100`,
      )) ?? [];
    if (page.length === 0) break;
    page.sort(compareSnowflakes);
    all.push(...page);
    cursor = page[page.length - 1].id;
    if (page.length < 100) break;
  }
  return all;
}

type Channel = { id: string; type: number; parent_id?: string | null };
const GUILD_FORUM = 15;
const GUILD_MEDIA = 16;

/** One week: the longest Discord keeps a quiet thread open. Posting in it opens it again. */
const THREAD_ARCHIVE_MINUTES = 10080;

/** Who a message may ping. By default nobody: mentions show as names. */
export type AllowedMentions = { parse: ("everyone" | "roles" | "users")[]; roles?: string[]; users?: string[] };

/** A message in any channel the bot can post in. Mentions show as names but don't ping anyone unless allowed. */
export async function postMessage(channelId: string, body: MessageBody, allowedMentions: AllowedMentions = { parse: [] }) {
  const msg = await discordFetch<DiscordMessage>(`/channels/${channelId}/messages`, { method: "POST", body: { ...body, allowed_mentions: allowedMentions } });
  if (!msg) throw new Error(`Discord channel ${channelId} wasn't found`);
  return msg;
}

/** A reply to a message, quoting it. Still posts (without the quote) if that message is gone. */
export async function replyToMessage(channelId: string, messageId: string, body: MessageBody, allowedMentions: AllowedMentions = { parse: [] }) {
  const msg = await discordFetch<DiscordMessage>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: { ...body, message_reference: { message_id: messageId, fail_if_not_exists: false }, allowed_mentions: allowedMentions },
  });
  if (!msg) throw new Error(`Discord channel ${channelId} wasn't found`);
  return msg;
}

/**
 * Rewrite a message the bot posted. False when it's gone (someone deleted it). One in a thread
 * that archived itself (a week without a message) takes no edits, so the thread's opened again.
 */
export async function editMessage(channelId: string, messageId: string, body: MessageBody) {
  const edit = async () =>
    (await discordFetch<DiscordMessage>(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body: { ...body, allowed_mentions: { parse: [] } } })) !== null;
  try {
    return await edit();
  } catch (err) {
    if (!(err instanceof Error && /"code":\s*50083/.test(err.message))) throw err;
    await discordFetch(`/channels/${channelId}`, { method: "PATCH", body: { archived: false } });
    return edit();
  }
}

export async function deleteMessage(channelId: string, messageId: string) {
  await discordFetch(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
}

/** The bot's own emoji, asked again after this long so ones uploaded since show up */
const EMOJI_TTL_MS = 10 * 60_000;
let emojiCache: { at: number; emoji: AppEmoji } | null = null;

/**
 * The bot's own emoji that are Boardroom's symbols (`pnpm discord:commands` uploads them), by
 * name. Empty, so posts use plain emoji, until they're uploaded or when Discord can't be asked.
 */
export async function fetchAppEmoji(): Promise<AppEmoji> {
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!appId || !process.env.DISCORD_BOT_TOKEN) return {};
  if (emojiCache && Date.now() - emojiCache.at < EMOJI_TTL_MS) return emojiCache.emoji;
  try {
    const list = await discordFetch<{ items: { id: string; name: string }[] }>(`/applications/${appId}/emojis`);
    emojiCache = { at: Date.now(), emoji: appEmoji(list?.items ?? []) };
    return emojiCache.emoji;
  } catch (err) {
    console.error("Couldn't list the bot's emoji", err);
    return {};
  }
}

/**
 * Register the bot's slash command and its Invite to … user command in the group's server, as
 * `welcome` names it. Guild commands show up at once, where global ones can take an hour.
 */
export async function registerCommands(welcome: string) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!appId || !guildId) throw new Error("Set DISCORD_CLIENT_ID and DISCORD_GUILD_ID");
  return (await discordFetch<{ name: string }[]>(`/applications/${appId}/guilds/${guildId}/commands`, { method: "PUT", body: botCommands(commandName(), welcome) })) ?? [];
}

// Text (0), announcement (5) and forum (15) channels: the ones Boardroom can read or post in
const POSTABLE_CHANNELS = new Set([0, 5, 15]);

/** The server's channels Boardroom can use, in the order Discord lists them, for the pickers on Group settings. [] without the bot. */
export async function listGuildChannels(): Promise<{ id: string; name: string; forum: boolean }[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return [];
  try {
    const channels = (await discordFetch<{ id: string; name: string; type: number; position: number }[]>(`/guilds/${guildId}/channels`)) ?? [];
    return channels
      .filter((c) => POSTABLE_CHANNELS.has(c.type))
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, forum: c.type === 15 }));
  } catch (err) {
    console.error("Couldn't list Discord channels", err);
    return [];
  }
}

/** The server's roles people can be given (not @everyone, not a bot's own), highest first. [] without the bot. */
export async function listGuildRoles(): Promise<{ id: string; name: string }[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return [];
  try {
    const roles = (await discordFetch<{ id: string; name: string; position: number; managed: boolean }[]>(`/guilds/${guildId}/roles`)) ?? [];
    return roles
      .filter((r) => r.id !== guildId && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name }));
  } catch (err) {
    console.error("Couldn't list Discord roles", err);
    return [];
  }
}

/** Each channel's type, once per server instance: it can't change, and it's asked on every edit */
const channelTypes = new Map<string, number>();

/**
 * Whether posts in this channel are threads of their own (a forum, or a media channel), so a
 * post's message lives in its thread rather than in the channel. A thread started from a
 * message in a text channel has the message's id too, so the ids can't tell them apart.
 */
export async function isForumChannel(channelId: string) {
  let type = channelTypes.get(channelId);
  if (type === undefined) {
    const channel = await discordFetch<Channel>(`/channels/${channelId}`);
    if (!channel) throw new Error(`Discord channel ${channelId} wasn't found`);
    type = channel.type;
    channelTypes.set(channelId, type);
  }
  return type === GUILD_FORUM || type === GUILD_MEDIA;
}

/**
 * Post a message with a thread of its own, and return the ids. In a text channel the thread
 * hangs off the message (and Discord gives it the message's id); in a forum the post is the
 * thread, and its first message has the same id. `messageChannelId` is where the message
 * lives, for editing it.
 */
export async function postWithThread(
  channelId: string,
  threadName: string,
  body: MessageBody,
  allowedMentions: AllowedMentions = { parse: [] },
): Promise<{ messageId: string; threadId: string; messageChannelId: string }> {
  if (await isForumChannel(channelId)) {
    const post = await discordFetch<Channel>(`/channels/${channelId}/threads`, {
      method: "POST",
      body: { name: threadName, auto_archive_duration: THREAD_ARCHIVE_MINUTES, message: { ...body, allowed_mentions: allowedMentions } },
    });
    if (!post) throw new Error("Discord didn't make the forum post");
    return { messageId: post.id, threadId: post.id, messageChannelId: post.id };
  }
  const msg = await postMessage(channelId, body, allowedMentions);
  const thread = await discordFetch<Channel>(`/channels/${channelId}/messages/${msg.id}/threads`, {
    method: "POST",
    body: { name: threadName, auto_archive_duration: THREAD_ARCHIVE_MINUTES },
  });
  return { messageId: msg.id, threadId: thread?.id ?? msg.id, messageChannelId: channelId };
}

/**
 * Add someone to a thread, so it shows under its channel in their channel list. Adding someone
 * who's already in it changes nothing. A thread that archived itself is opened again first.
 */
export async function addToThread(threadId: string, userId: string) {
  const add = () => discordFetch(`/channels/${threadId}/thread-members/${userId}`, { method: "PUT" });
  try {
    await add();
  } catch {
    await discordFetch(`/channels/${threadId}`, { method: "PATCH", body: { archived: false } });
    await add();
  }
}

/** Rename a thread the bot started */
export async function renameThread(threadId: string, name: string) {
  await discordFetch(`/channels/${threadId}`, { method: "PATCH", body: { name } });
}

/** Delete a thread, or a forum post with everything in it. Needs Manage Threads. */
export async function deleteThread(threadId: string) {
  await discordFetch(`/channels/${threadId}`, { method: "DELETE" });
}

/** Finish a reply that was deferred ("thinking…") while slower work ran */
export async function editInteractionReply(applicationId: string, token: string, body: { content: string; components?: unknown[] }) {
  await discordFetch(`/webhooks/${applicationId}/${token}/messages/@original`, { method: "PATCH", body: { ...body, allowed_mentions: { parse: [] } } });
}

/** A channel's link, for "events are posted in #events" */
export function channelUrl(channelId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  return guildId ? `https://discord.com/channels/${guildId}/${channelId}` : null;
}

/** A message's link, for "see it in Discord" */
export function messageUrl(channelId: string, messageId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  return guildId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null;
}

/** The id a message posted at `ms` would have, for paging the channel by time. */
export function snowflakeAt(ms: number) {
  const DISCORD_EPOCH = BigInt(1_420_070_400_000);
  return ((BigInt(ms) - DISCORD_EPOCH) << BigInt(22)).toString();
}

export function compareSnowflakes(a: { id: string }, b: { id: string }) {
  const x = BigInt(a.id);
  const y = BigInt(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
}

function displayName(u: DiscordUser) {
  return u.global_name || u.username;
}
