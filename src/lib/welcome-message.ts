/**
 * What the bot says when someone gets the member role: a hello in the core group's channel, a
 * DM with how to get set up, and the reply to whoever invited them. Pure, so it's tested.
 *
 * Everyone already comes to the casual night, so this is an extra (the heavier game nights and
 * a few more channels), never "joining the group". Keep it light.
 */

import { ACCENT, ACTION_ROW, BUTTON, COMPONENTS_V2, CONTAINER, LINK_BUTTON_STYLE, TEXT, type Component, escape } from "./discord-components";

export type Welcome = {
  /** Who's being invited */
  discordId: string;
  name: string;
  /** Who invited them, @-mentioned when they're in Discord */
  by: { name: string; discordId?: string | null };
  /** The member role's name in the server; null when the group has no role */
  roleName: string | null;
  siteName: string;
  /** The setup page (/welcome), when the site's address is known */
  setupUrl: string | null;
  /** Where the core group's events are posted, to point them at */
  eventsChannelId: string | null;
  /** The slash command, "event" unless the group renamed it */
  command: string;
  /** The core group's night, when the group has a casual night too: what the role gets them into */
  coreNight: string | null;
};

const who = (p: { name: string; discordId?: string | null }) => (p.discordId ? `<@${p.discordId}>` : `**${escape(p.name)}**`);

/** "Sam gave you the Strategy role, so Strategy events are open to you now too, plus a few more channels." */
function whatChanged(w: Welcome, by: string) {
  if (!w.roleName) return `${by} added you.`;
  const extra = w.coreNight ? `, so **${escape(w.coreNight)}** events are open to you now too, plus a few more channels` : "";
  return `${by} gave you the **${escape(w.roleName)}** role${extra}.`;
}

const setupButton = (w: Welcome): Component[] =>
  w.setupUrl ? [{ type: ACTION_ROW, components: [{ type: BUTTON, style: LINK_BUTTON_STYLE, label: "Get set up", url: w.setupUrl }] }] : [];

const card = (w: Welcome, text: string) => ({
  flags: COMPONENTS_V2,
  components: [{ type: CONTAINER, accent_color: ACCENT, components: [{ type: TEXT, content: text }] }, ...setupButton(w)],
});

/** The hello in the core group's channel. It pings only the person invited. */
export function welcomePost(w: Welcome) {
  return card(
    w,
    [
      `### 👋 Welcome in, <@${w.discordId}>!`,
      `${whatChanged(w, who(w.by))} Sign in to ${escape(w.siteName)} to rank the games you've played and help pick what's next.`,
    ].join("\n"),
  );
}

/** The DM: what getting set up takes, step by step, with the link */
export function welcomeDm(w: Welcome) {
  const steps = [
    `1. **Sign in with Discord.** Plays you've been tagged in come with you${w.coreNight ? ", casual night ones too" : ""}.`,
    "2. **Rate the games you've played.** One tap each.",
    '3. **Rank them** with a few quick "this or that?" questions.',
    "4. **Add your BGG username** if you have one, so your games show up on the shared shelf.",
  ];
  const text = [
    `### Hey ${escape(w.name)}!`,
    `${whatChanged(w, escape(w.by.name))} It also gets you into ${escape(w.siteName)}${w.setupUrl ? `: ${w.setupUrl}` : "."}`,
    `Setting up takes about five minutes.\n${steps.join("\n")}`,
    w.eventsChannelId && `Events go up in <#${w.eventsChannelId}>. Hit **Going** on one, or make your own with \`/${w.command} new\`.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return card(w, text);
}

export type WelcomeResult = {
  name: string;
  /** given: the role was added; none: the group has no member role to give */
  role: "given" | "none";
  roleName: string | null;
  /** The channel it said hi in, or why it couldn't */
  post: { channelId: string } | { error: string } | null;
  dm: "sent" | { error: string };
  setupUrl: string | null;
};

/**
 * What happened, for whoever invited them. `channel` names a channel: a mention in Discord,
 * plain words on the site, where a mention would show as a number.
 */
export function welcomeSummary(r: WelcomeResult, channel: (id: string) => string) {
  // Their name goes in whichever comes first; "them" after that
  const did = [
    r.role === "given" && ((n: string) => `gave ${n} the ${r.roleName ?? "member"} role`),
    r.post && "channelId" in r.post && ((n: string) => `said hi to ${n} in ${channel((r.post as { channelId: string }).channelId)}`),
    r.dm === "sent" && ((n: string) => `DMed ${n} the setup link`),
  ]
    .filter((s): s is (n: string) => string => Boolean(s))
    .map((say, i) => say(i === 0 ? r.name : "them"));
  const lines = [did.length ? `Done: ${listOf(did)}.` : `Done: ${r.name} can sign in now.`];
  if (r.post && "error" in r.post) lines.push(`Couldn't post the hello: ${r.post.error}`);
  if (r.dm !== "sent") lines.push(`Couldn't DM them: ${r.dm.error}${r.setupUrl ? ` Send them ${r.setupUrl} yourself.` : ""}`);
  return lines.join("\n");
}

const listOf = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);
