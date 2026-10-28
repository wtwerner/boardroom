import "server-only";
import { eq } from "drizzle-orm";
import { CASUAL_NIGHT, NIGHT_NAMES, SITE_NAME, SITE_URL } from "@/config";
import { db, schema } from "@/db";
import {
  commandName,
  eventsChannel,
  getServerMember,
  giveMemberRole,
  hasMemberRole,
  memberRoleName,
  postMessage,
  postsNights,
  discordCode,
  sendDirectMessage,
  welcomeChannel,
} from "./discord";
import { welcomeCommandName } from "./discord-commands";
import { playerForDiscordUser } from "./night-store";
import { type Welcome, type WelcomeResult, welcomeDm, welcomePost } from "./welcome-message";

/**
 * Inviting someone from the server to the core group's nights, from the People page or the
 * Invite to … command in Discord: give them the member role, say hi in the core group's
 * channel, DM them how to get set up, and note it on their player so People shows they're on
 * their way. Errors are plain sentences, shown to people as they are.
 */

/** Whether the site can invite anyone: it needs the bot in the group's server */
export const canWelcome = () => Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);

/** The core group's night, when there's a casual night too: what an invite gets someone into */
export const coreNightName = () => (CASUAL_NIGHT ? NIGHT_NAMES.core : null);

/** The command on the right-click menu: "Invite to Strategy events" */
export const welcomeName = () => welcomeCommandName(coreNightName(), SITE_NAME);

/** Who someone is in the server, and whether they already have the member role (or, without one, an account) */
export async function welcomeCandidate(discordId: string) {
  const member = await getServerMember(discordId);
  if (!member) throw new Error("They're not in the server yet.");
  if (member.bot) throw new Error("That's a bot.");
  // Without a role, anyone in the server can sign in, so having an account is the same thing
  const account = await db.query.user.findFirst({ where: eq(schema.user.discordId, discordId), columns: { id: true } });
  const already = member.hasRole ?? Boolean(account);
  return { ...member, already };
}

export async function welcomeToGroup(discordId: string, by: { name: string; userId: string | null; discordId: string | null }): Promise<WelcomeResult> {
  if (!canWelcome()) throw new Error("Inviting people needs the bot in the server (DISCORD_BOT_TOKEN and DISCORD_GUILD_ID).");
  const member = await welcomeCandidate(discordId);
  if (member.already) throw new Error(alreadyIn(member.name));

  const roleName = await memberRoleName().catch(() => null);
  if (hasMemberRole()) {
    try {
      await giveMemberRole(discordId, `Invited by ${by.name} on ${SITE_NAME}`);
    } catch (err) {
      if (discordCode(err) === 50013 || /→ 403/.test(String(err))) {
        throw new Error(
          `The bot can't hand out roles yet. In Server Settings → Roles, give the ${SITE_NAME} role Manage Roles and drag it above ${roleName ?? "the member role"}.`,
        );
      }
      console.error(`Couldn't give ${discordId} the member role`, err);
      throw new Error("Couldn't give them the role. Try again in a minute?");
    }
  }

  // Their history from the play logs is theirs when they sign in; this marks them as on their way
  const player = await playerForDiscordUser(discordId, member.name);
  await db.update(schema.player).set({ welcomedAt: new Date(), welcomedBy: by.userId }).where(eq(schema.player.id, player.id));

  const w: Welcome = {
    discordId,
    name: member.name,
    by: { name: by.name, discordId: by.discordId },
    roleName,
    siteName: SITE_NAME,
    setupUrl: SITE_URL ? `${SITE_URL}/welcome` : null,
    eventsChannelId: postsNights("core") ? eventsChannel("core") : null,
    command: commandName(),
    coreNight: coreNightName(),
  };

  const channelId = await welcomeChannel();
  const [post, dm] = await Promise.all([
    channelId
      ? postMessage(channelId, welcomePost(w), { parse: [], users: [discordId] }).then(
          () => ({ channelId }),
          (err) => {
            console.error(`Couldn't welcome ${discordId} in ${channelId}`, err);
            return { error: discordCode(err) === 50013 || /→ 403/.test(String(err)) ? "the bot can't post in that channel." : "Discord didn't take it." };
          },
        )
      : null,
    sendDirectMessage(discordId, welcomeDm(w)).then(
      () => "sent" as const,
      (err) => {
        if (discordCode(err) !== 50007) console.error(`Couldn't DM ${discordId}`, err);
        return { error: discordCode(err) === 50007 ? "they've got DMs from server members turned off." : "Discord didn't take it." };
      },
    ),
  ]);

  return { name: member.name, role: hasMemberRole() ? "given" : "none", roleName, post, dm, setupUrl: w.setupUrl };
}

/** "Casey already has the role", or without a role, "Casey's already signed up" */
export const alreadyIn = (name: string) => (hasMemberRole() ? `${name} already has the role.` : `${name}'s already signed up.`);
