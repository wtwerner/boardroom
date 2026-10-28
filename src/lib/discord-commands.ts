/**
 * The bot's slash commands, as Discord registers them. Pure, so what's registered is tested;
 * scripts/discord-commands.ts sends them to the group's server.
 */

import type { Night } from "@/db/enums";

const SUB_COMMAND = 1;
const STRING = 3;

/** A command on someone's right-click menu (Apps → …), rather than one typed after a slash */
const USER_COMMAND = 2;

/** Only in the server, not in DMs with the bot */
const GUILD_CONTEXT = 0;

export function nightCommands(name: string) {
  const event = { name: "event", description: "Which event", type: STRING, required: true, autocomplete: true };
  return [
    {
      name,
      description: "Make, change or cancel a game event, or find a date for one",
      type: 1,
      contexts: [GUILD_CONTEXT],
      // Leaving default_member_permissions out lets everyone use it; the server owner can narrow
      // that under Server Settings → Integrations, and the bot checks the member role itself
      options: [
        { name: "new", description: "Make an event: a form opens for the date, time, title and place", type: SUB_COMMAND },
        { name: "poll", description: "Not sure when? Offer a few dates and let people say which work", type: SUB_COMMAND },
        { name: "edit", description: "Change an event's title, date, time, place or seats", type: SUB_COMMAND, options: [event] },
        { name: "cancel", description: "Cancel an event", type: SUB_COMMAND, options: [event] },
      ],
    },
  ];
}

/**
 * Right-click someone → Apps → Invite to Strategy events (the core group's night, or the
 * site when there's only one kind): gives them the member role, says hi and DMs them how to get
 * set up. Everyone already comes to the casual night, so it's named for what it adds. User
 * commands have a name of 32 characters at most, and no description.
 */
export const welcomeCommandName = (coreNight: string | null, siteName: string) => {
  const name = coreNight ? `Invite to ${coreNight} events` : `Invite to ${siteName}`;
  // A long night name drops "events" before it's cut short
  return (name.length <= 32 ? name : `Invite to ${coreNight ?? siteName}`).slice(0, 32).trim();
};

/** Manage Roles, as Discord's permission bit */
const MANAGE_ROLES = 1 << 28;

/**
 * Only people who can manage roles see it to start with, so it isn't on everyone's menu. The
 * server owner can let the member role use it under Server Settings → Integrations; the bot
 * still checks the member role itself.
 */
const welcomeCommand = (name: string) => ({
  name,
  type: USER_COMMAND,
  contexts: [GUILD_CONTEXT],
  default_member_permissions: String(MANAGE_ROLES),
});

/** Everything scripts/discord-commands.ts registers */
export const botCommands = (name: string, welcomeName: string) => [...nightCommands(name), welcomeCommand(welcomeName)];

/**
 * Which kind of night a channel belongs to (its events channel or its plays channel), so
 * /event new used there starts as that kind. Null for any other channel.
 */
export function kindOfChannel(channelId: string | undefined, channels: Partial<Record<Night, (string | null)[]>>): Night | null {
  if (!channelId) return null;
  const match = (Object.entries(channels) as [Night, (string | null)[]][]).find(([, ids]) => ids.includes(channelId));
  return match?.[0] ?? null;
}
