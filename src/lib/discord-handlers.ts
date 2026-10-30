import "server-only";
import { after } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { CASUAL_NIGHT, GROUP_NIGHTS, NIGHT_NAMES, SETTINGS, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { NIGHTS, type Night, POLL_MAX_DATES, type RsvpStatus } from "@/db/enums";
import { commandName, editInteractionReply, eventsChannel, playsChannel, postsNights } from "./discord";
import {
  APPLICATION_COMMAND,
  AUTOCOMPLETE,
  type FormField,
  type Interaction,
  MESSAGE_COMPONENT,
  MODAL_SUBMIT,
  actionId,
  ask,
  choices,
  commandOptions,
  deferReply,
  deferUpdate,
  formValues,
  memberName,
  modal,
  parseActionId,
  pickedUser,
  reply,
  updateReply,
} from "./interactions";
import { answerBringAsk, cancelNight, createNight, editNight, ownNight, playerForDiscordUser, playerNamed, setRsvp, waitingFor } from "./night-store";
import { joinThread, postInThread, syncNightPost, syncNightPostLater, upcomingOwnNights } from "./night-post";
import { localDate, nightTitle, nightWhen, soonLabel } from "./nights";
import { inSentence } from "./text";
import { formatForForm, parseDateList, parseTime, parseWhen } from "./when";
import { addPollDate, answerOf, createPoll, dateFellThrough, datesStaying, loadPoll, noDatesWork, ownPoll, pollOfDate, reopenPoll, setDateAnswer, setPollDate } from "./poll-store";
import { announceDateSetLater, announceFellThroughLater } from "./poll-post";
import { dateChoiceLabel, stayingLine } from "./poll-message";
import { rankDates, toggleWorks } from "./date-answers";
import { kindOfChannel } from "./discord-commands";
import { escape } from "./discord-components";
import { alreadyIn, canWelcome, welcomeCandidate, welcomeName, welcomeToGroup } from "./welcome";
import { welcomeSummary } from "./welcome-message";
import { bringAnswered, bringAskGone } from "./bring-message";

/**
 * What the bot does with each button click, slash command and form, called from
 * /api/discord/interactions once Discord's signature checks out. Each one answers within
 * Discord's three seconds; slower work (posting a night, editing its post) runs after.
 * The writes go through night-store.ts, the same as the site's.
 */
export async function handleInteraction(i: Interaction): Promise<object> {
  const guildId = process.env.DISCORD_GUILD_ID;
  // The bot's DMs (asking someone to bring a game) have buttons too, and come without a server
  const inDm = !i.guild_id && Boolean(i.user);
  if (!inDm && (!i.member || (guildId && i.guild_id !== guildId))) return reply(`${SITE_NAME} only works in its group's server.`);
  try {
    if (inDm) {
      const action = i.type === MESSAGE_COMPONENT ? parseActionId(i.data?.custom_id) : null;
      return action?.kind === "bring" ? await bringAnswer(i, action) : reply(`${SITE_NAME} only works in its group's server.`);
    }
    if (i.type === APPLICATION_COMMAND) return await command(i);
    if (i.type === AUTOCOMPLETE) return await autocomplete(i);
    if (i.type === MESSAGE_COMPONENT) return await component(i);
    if (i.type === MODAL_SUBMIT) return await submitted(i);
    return reply("That isn't something I know how to do yet.");
  } catch (err) {
    // night-store's errors are written for people; anything else is logged
    const message = err instanceof Error && err.message.length < 200 && !/SQLITE|Failed query|Discord /.test(err.message) ? err.message : null;
    if (!message) console.error("Discord interaction failed", err);
    // Autocomplete can only answer with choices
    if (i.type === AUTOCOMPLETE) return choices([]);
    return reply(message ?? "Something went wrong there. Try again in a minute.");
  }
}

/** Why a night or poll made here wasn't posted: no events channel for its kind on Group settings, or no bot token */
const notPostedReason = (night: Night) =>
  eventsChannel(night) ? "DISCORD_BOT_TOKEN isn't set" : `Group settings has no events channel${CASUAL_NIGHT ? ` for ${inSentence(NIGHT_NAMES[night])}` : ""}`;

/** Members of the group: anyone in the server, or holders of the member role when Group settings names one */
function isMember(i: Interaction) {
  const role = SETTINGS.memberRole;
  return !role || Boolean(i.member?.roles.includes(role));
}

/** The core group's nights are for members; the casual night is for anyone in the server */
const mayAnswer = (i: Interaction, night: Night) => night === "casual" || isMember(i);

/**
 * Said to someone without the member role who tries something that needs it. Only reached when
 * there is a role, so it can name it (a mention, which shows the role's name without pinging).
 */
const roleNeeded = () => `<@&${SETTINGS.memberRole}>`;
const MEMBERS_ONLY = () => `That needs the ${roleNeeded()} role.`;

/** Everyone's welcome at the casual night; this is a core group's night, and anyone with the role can invite them */
const NOT_THIS_ONE = () => `This one's for the ${roleNeeded()} role. If you're keen, anyone with it can invite you.`;

async function command(i: Interaction) {
  if (i.data?.name === welcomeName()) return welcomeCommand(i);
  if (i.data?.name !== commandName()) return reply("That command isn't mine.");
  const { sub, values } = commandOptions(i.data.options);
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  if (sub === "new") return newNightForm(i, Number(values.seats) || undefined);
  if (sub === "poll") return newPollForm(i);
  const nightId = Number(values.event);
  if (!Number.isInteger(nightId)) return reply("Pick an event from the list.");
  if (sub === "edit") return editForm(await ownNight(nightId));
  if (sub === "cancel") {
    const n = await ownNight(nightId);
    if (n.cancelled) return reply("That event is already cancelled.");
    return ask(`Cancel **${n.title}** (<t:${unix(n.startsAt)}:F>)? Its post will say so, and it leaves the list of events.`, [
      { label: "Cancel the event", customId: actionId({ kind: "cancel", nightId: n.id }), danger: true },
    ]);
  }
  const cmd = commandName();
  return reply(`Try /${cmd} new, /${cmd} poll, /${cmd} edit or /${cmd} cancel.`);
}

/** Nights to pick from as people type, soonest first */
async function autocomplete(i: Interaction) {
  const { values, focused } = commandOptions(i.data?.options);
  if (focused !== "event") return choices([]);
  const typed = (values.event ?? "").toLowerCase();
  const nights = await upcomingOwnNights();
  return choices(
    nights
      .map((n) => {
        const iso = n.startsAt.toISOString();
        return { name: `${soonLabel(iso, TIME_ZONE) ?? nightWhen(iso, TIME_ZONE).label} · ${n.title}`, value: String(n.id) };
      })
      .filter((c) => !typed || c.name.toLowerCase().includes(typed)),
  );
}

async function component(i: Interaction) {
  const action = parseActionId(i.data?.custom_id);
  if (!action || action.kind === "new" || action.kind === "newPoll") return reply("That button is from an older version. The event's post has the current ones.");
  if (action.kind === "welcome") return welcomeConfirmed(i, action.userId);
  if (action.kind === "bring") return bringAnswer(i, action);
  if (action.kind === "pollVote" || action.kind === "pollAdd" || action.kind === "pollPick" || action.kind === "pollNone" || action.kind === "pollOff" || action.kind === "pollReopen") return pollButton(i, action);
  const n = await ownNight(action.nightId);

  if (action.kind === "rsvp") {
    if (!mayAnswer(i, n.night)) return reply(NOT_THIS_ONE());
    const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
    const waiting = await waitingFor(n.id);
    await setRsvp({ nightId: n.id, playerId: player.id, status: action.status, via: "discord" });
    syncNightPostLater(n.id, { join: player.id, waiting });
    return deferUpdate();
  }
  if (action.kind === "for") {
    if (!mayAnswer(i, n.night)) return reply(NOT_THIS_ONE());
    if (n.cancelled) return reply("That event was cancelled.");
    return modal(actionId({ kind: "for", nightId: n.id }), "Answer for someone else", [
      { id: "who", label: "Who", user: true, placeholder: "Someone in the server" },
      { id: "name", label: "Or their name", placeholder: "Someone who isn't in Discord", maxLength: 40 },
      { id: "answer", label: "Their answer", options: ANSWERS.map((a) => ({ label: a.label, value: a.status })), selected: "going" },
    ]);
  }
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  if (action.kind === "edit") return editForm(n);
  if (action.kind === "refind") return refindForm(n);

  // Confirmed from /event cancel
  await cancelNight(n.id);
  after(async () => {
    try {
      await syncNightPost(n.id);
      await postInThread(n.id, `❌ <@${i.member!.user.id}> cancelled the event.`);
    } catch (err) {
      console.error(`Couldn't mark night ${n.id} cancelled in Discord`, err);
    }
  });
  return updateReply(`Cancelled **${n.title}**.`);
}

async function submitted(i: Interaction) {
  const action = parseActionId(i.data?.custom_id);
  const form = formValues(i.data?.components);
  // Like the card's own buttons, anyone may answer on the casual night
  if (action?.kind === "for") return answerFor(i, action.nightId, form);
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  if (action?.kind === "new") return newNight(i, form, action.seats ?? null);
  if (action?.kind === "newPoll") return newPoll(i, form);
  if (action?.kind === "pollAdd") return suggestDate(i, action.pollId, form);
  if (action?.kind === "pollPick") return pickDate(i, action.pollId, form);
  if (action?.kind === "refind") return refindDate(i, action.nightId, form);
  if (action?.kind !== "edit") return reply("That form is from an older version. Try again.");

  const n = await ownNight(action.nightId);
  const shown = formatForForm(n.startsAt, TIME_ZONE);
  const when = parseWhen(form.date || shown.date, form.time || shown.time, new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  const seats = form.seats ? Number(form.seats) : null;
  if (seats !== null && !(Number.isInteger(seats) && seats > 0 && seats <= 100)) return reply("Seats should be a number, or empty for no limit.");

  const waiting = await waitingFor(n.id);
  const before = await editNight(n.id, { title: form.title || n.title, startsAt: when.startsAt, location: form.location || null, capacity: seats });
  syncNightPostLater(n.id, { note: { before, by: { name: memberName(i), discordId: i.member!.user.id } }, waiting });
  return reply(`Saved: **${form.title || n.title}**, <t:${unix(when.startsAt)}:F>${form.location ? ` at ${form.location}` : ""}.`);
}

/**
 * Find a new date on a night's post opens this: more dates to offer, at the night's time unless
 * they say, and which dates on offer stay
 */
async function refindForm(n: typeof schema.gameNight.$inferSelect) {
  if (n.cancelled) return reply("That event was cancelled.");
  if (n.findingDate) return reply("It's finding a date already.");
  const staying = await datesStaying(n.id);
  return modal(actionId({ kind: "refind", nightId: n.id }), "Date fell through", [
    {
      id: "dates",
      label: staying.length ? "More dates to offer" : "Dates to offer",
      description: stayingLine(staying.map((d) => d.startsAt), TIME_ZONE),
      placeholder: "thu, sat 2pm, 11/7",
      // With none staying, it needs some
      required: !staying.length,
      long: true,
      maxLength: 300,
    },
    { id: "time", label: "Time", description: "Dates start then unless one gives its own. Answers for this date are kept with it.", value: formatForForm(n.startsAt, TIME_ZONE).time, placeholder: "7pm", required: true, maxLength: 20 },
  ]);
}

/** The Date fell through form sent back: the night goes back to finding a date, and its post shows the dates on offer */
async function refindDate(i: Interaction, nightId: number, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const time = parseTime(form.time ?? "");
  if (!time) return reply(`Couldn't read "${form.time}" as a time. Try 7pm or 19:00.`);
  const dates = form.dates ? parseDateList(form.dates, time, new Date(), TIME_ZONE, POLL_MAX_DATES) : [];
  if ("error" in dates) return reply(dates.error);
  const n = await ownNight(nightId);
  const found = await dateFellThrough(nightId, dates.map((d) => d.startsAt), userId);
  announceFellThroughLater(nightId, { by: `<@${i.member!.user.id}>`, was: found.was.toISOString(), going: found.going });
  return reply(`**${escape(n.title)}** is finding a date again. Its post shows the dates on offer, and everyone's answers to them are still there.`);
}

const ANSWERS: { status: RsvpStatus; label: string }[] = [
  { status: "going", label: "Going" },
  { status: "maybe", label: "Maybe" },
  { status: "declined", label: "Can't make it" },
];

/**
 * The Someone else… form sent back: answer for someone in the server, or for someone named
 * who isn't in Discord yet (the same as naming someone new on the site). Someone picked joins
 * the thread, as if they'd answered themselves.
 */
async function answerFor(i: Interaction, nightId: number, form: Record<string, string>) {
  const n = await ownNight(nightId);
  if (!mayAnswer(i, n.night)) return reply(NOT_THIS_ONE());
  const answer = ANSWERS.find((a) => a.status === form.answer) ?? ANSWERS[0];
  const picked = pickedUser(i, "who");
  if (picked?.bot) return reply("That's a bot. Pick a person, or give their name.");
  if (!picked && !form.name) return reply("Pick someone, or give their name.");

  const playerId = picked ? (await playerForDiscordUser(picked.id, picked.name)).id : await playerNamed(form.name);
  const waiting = await waitingFor(n.id);
  await setRsvp({ nightId: n.id, playerId, status: answer.status, via: "discord" });
  syncNightPostLater(n.id, { join: playerId, waiting });
  const who = picked ? `<@${picked.id}>` : `**${escape(form.name)}**`;
  return reply(`Answered **${answer.label}** for ${who} on **${n.title}**.`);
}

/**
 * Right-click someone → Apps → Invite to …. Giving the role lets them in to the site, so it
 * asks first, saying what's about to happen.
 */
async function welcomeCommand(i: Interaction) {
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  if (!canWelcome()) return reply("Inviting people needs the bot in the server.");
  const target = i.data?.target_id;
  if (!target) return reply("Right-click someone in the server to invite them.");
  const member = await welcomeCandidate(target);
  if (member.already) return reply(escape(alreadyIn(member.name)));
  const role = SETTINGS.memberRole;
  const question = role ? `Give **${escape(member.name)}** the <@&${role}> role?` : `Invite **${escape(member.name)}**?`;
  return ask(`${question} The bot will say hi in the channel and DM them a link to get set up.`, [
    { label: `Invite ${member.name}`.slice(0, 80), customId: actionId({ kind: "welcome", userId: target }) },
  ]);
}

/** The confirm button: giving the role, posting and DMing take a few calls, so the answer replaces the question once they're done */
async function welcomeConfirmed(i: Interaction, discordId: string) {
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  const by = { name: memberName(i), discordId: i.member!.user.id, userId: await accountFor(i) };
  after(async () => {
    let content: string;
    try {
      content = welcomeSummary(await welcomeToGroup(discordId, by), (id) => `<#${id}>`);
    } catch (err) {
      const message = err instanceof Error && err.message.length < 300 && !/SQLITE|Failed query|Discord \//.test(err.message) ? err.message : null;
      if (!message) console.error(`Couldn't welcome ${discordId}`, err);
      content = message ?? "Something went wrong there. Try again in a minute?";
    }
    await editInteractionReply(i.application_id, i.token, { content, components: [] }).catch((err) => console.error("Couldn't finish the reply", err));
  });
  return deferUpdate();
}

/** The buttons on the DM asking someone to bring a game: the answer replaces the question */
async function bringAnswer(i: Interaction, action: { planId: number; yes: boolean }) {
  const discordId = (i.member?.user ?? i.user)!.id;
  const me = await db.query.user.findFirst({ where: eq(schema.user.discordId, discordId), columns: { id: true } });
  const answered = me ? await answerBringAsk(action.planId, me.id, action.yes) : null;
  if (!answered) return updateReply(bringAskGone);
  syncNightPostLater(answered.nightId);
  return updateReply(bringAnswered({ yes: action.yes, game: answered.game, night: answered.night }));
}

/** Making a night needs an account: a night belongs to whoever made it */
async function accountFor(i: Interaction) {
  const member = await db.query.user.findFirst({ where: eq(schema.user.discordId, i.member!.user.id), columns: { id: true } });
  return member?.id ?? null;
}

const signInFirst = () => reply(`Sign in to ${SITE_NAME} once first${SITE_URL ? ` (${SITE_URL})` : ""}, so the events you make are yours.`);

/**
 * /event new opens the form, as the kind of night whose channel it was used in, with the
 * last night of that kind's time and place filled in. Seats given after the command come back
 * with the form.
 */
async function newNightForm(i: Interaction, seats?: number) {
  if (!(await accountFor(i))) return signInFirst();
  const fromChannel = kindOfChannel(i.channel_id, Object.fromEntries(GROUP_NIGHTS.map((k) => [k, [eventsChannel(k), playsChannel(k)]])));
  const night: Night = CASUAL_NIGHT && fromChannel ? fromChannel : "core";
  const last = await lastNight(night);
  const fields: FormField[] = [
    ...(CASUAL_NIGHT
      ? [{ id: "kind", label: "Kind of event", options: GROUP_NIGHTS.map((k) => ({ label: NIGHT_NAMES[k], value: k })), selected: night }]
      : []),
    { id: "date", label: "Date", placeholder: "thu, tomorrow, 10/29 or Oct 29", required: true, maxLength: 40 },
    { id: "time", label: "Time", value: last.time, placeholder: "7pm", required: true, maxLength: 20 },
    { id: "title", label: "Title", placeholder: `Empty: "${nightTitle(night, localDate(new Date()))}", with its date`, maxLength: 100 },
    { id: "location", label: "Where", value: last.location ?? undefined, maxLength: 100 },
  ];
  return modal(actionId({ kind: "new", seats }), seats ? `New event, ${seats} seats` : "New event", fields);
}

/** The /event new form sent back: make the night, then post it */
async function newNight(i: Interaction, form: Record<string, string>, capacity: number | null) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const night: Night = CASUAL_NIGHT && NIGHTS.includes(form.kind as Night) ? (form.kind as Night) : "core";

  const when = parseWhen(form.date ?? "", form.time ?? "", new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  if (when.startsAt.getTime() < Date.now()) return reply(`<t:${unix(when.startsAt)}:F> has already started. Pick a time that's coming up.`);

  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const title = form.title || nightTitle(night, when.date);
  const location = form.location || null;
  const row = await createNight({ night, title, startsAt: when.startsAt, location, capacity }, userId);

  // Posting takes a few calls to Discord, so the reply comes once it's up
  after(async () => {
    let done = `Made **${title}** (${NIGHT_NAMES[night]}), <t:${unix(when.startsAt)}:F>${location ? ` at ${location}` : ""}${capacity ? `, ${capacity} seats` : ""}.`;
    try {
      if (!postsNights(night)) {
        // Saved, but there's nowhere to post it: say so, rather than leave people looking for a post
        done += ` It isn't posted in Discord: ${notPostedReason(night)}.`;
      } else {
        // Not marked going, but added to the thread to follow it
        if ((await syncNightPost(row.id)) === "posted") await joinThread(row.id, undefined, [player.id]);
        const posted = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, row.id), columns: { url: true } });
        done += posted?.url ? ` It's posted: ${posted.url}` : "";
      }
    } catch (err) {
      console.error(`Couldn't post night ${row.id}`, err);
      done += " Its post didn't go up; it'll try again the next time the event changes.";
    }
    if (SITE_URL && night === "core") done += `\nPlan it: ${SITE_URL}/events/${row.id}`;
    await editInteractionReply(i.application_id, i.token, { content: done }).catch((err) => console.error("Couldn't finish the reply", err));
  });
  return deferReply();
}

function editForm(n: typeof schema.gameNight.$inferSelect) {
  if (n.cancelled) return reply("That event was cancelled.");
  const shown = formatForForm(n.startsAt, TIME_ZONE);
  return modal(actionId({ kind: "edit", nightId: n.id }), "Change the event", [
    { id: "title", label: "Title", value: n.title, required: true, maxLength: 100 },
    { id: "date", label: "Date", value: shown.date, placeholder: "thu, 10/29 or Oct 29", required: true, maxLength: 40 },
    { id: "time", label: "Time", value: shown.time, placeholder: "7pm", required: true, maxLength: 20 },
    { id: "location", label: "Where", value: n.location ?? undefined, maxLength: 100 },
    { id: "seats", label: "Seats", value: n.capacity ? String(n.capacity) : undefined, placeholder: "Empty for no limit", maxLength: 3 },
  ]);
}

/** The usual time and place for this kind of night: the last one someone planned */
async function lastNight(night: Night) {
  const n = schema.gameNight;
  const row = await db.query.gameNight.findFirst({
    where: and(eq(n.night, night), eq(n.cancelled, false), isNotNull(n.createdBy)),
    orderBy: desc(n.startsAt),
  });
  return { time: row ? formatForForm(row.startsAt, TIME_ZONE).time : "7:00 pm", location: row?.location ?? null };
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

// Finding a date: a night offers a few and people say which work

/**
 * /event poll opens the form, with the last night's time and place filled in. With a casual
 * night it's for whichever kind's channel it was run in, which the form can change, as /event new.
 */
async function newPollForm(i: Interaction) {
  if (!(await accountFor(i))) return signInFirst();
  const fromChannel = kindOfChannel(i.channel_id, Object.fromEntries(GROUP_NIGHTS.map((k) => [k, [eventsChannel(k), playsChannel(k)]])));
  const night: Night = CASUAL_NIGHT && fromChannel ? fromChannel : "core";
  const last = await lastNight(night);
  return modal(actionId({ kind: "newPoll" }), "Find a date", [
    ...(CASUAL_NIGHT
      ? [{ id: "kind", label: "Kind of event", options: GROUP_NIGHTS.map((k) => ({ label: NIGHT_NAMES[k], value: k })), selected: night }]
      : []),
    {
      id: "dates",
      label: "Dates to pick from",
      description: `Up to ${POLL_MAX_DATES}. Give one a time of its own (sat 2pm), or it starts at the time below.`,
      placeholder: "thu, sat 2pm, 11/7",
      required: true,
      long: true,
      maxLength: 300,
    },
    { id: "time", label: "Time", value: last.time, placeholder: "7pm", required: true, maxLength: 20 },
    { id: "title", label: "Title", placeholder: `Optional: what the ${CASUAL_NIGHT ? "event" : inSentence(NIGHT_NAMES.core)} will be called`, maxLength: 100 },
    { id: "location", label: "Where", value: last.location ?? undefined, maxLength: 100 },
  ]);
}

/** The /event poll form sent back: make the night, then post it */
async function newPoll(i: Interaction, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const time = parseTime(form.time ?? "");
  if (!time) return reply(`Couldn't read "${form.time}" as a time. Try 7pm or 19:00.`);
  const dates = parseDateList(form.dates ?? "", time, new Date(), TIME_ZONE, POLL_MAX_DATES);
  if ("error" in dates) return reply(dates.error);

  const night: Night = CASUAL_NIGHT && NIGHTS.includes(form.kind as Night) ? (form.kind as Night) : "core";
  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const { nightId } = await createPoll({ night, title: form.title || null, location: form.location || null, dates: dates.map((d) => d.startsAt) }, userId);
  const title = form.title || NIGHT_NAMES[night];

  after(async () => {
    let done = `Offered ${dates.length} ${dates.length === 1 ? "date" : "dates"} for **${escape(title)}**: ${dates.map((d) => `<t:${unix(d.startsAt)}:F>`).join(", ")}.`;
    try {
      if (!postsNights(night)) {
        done += ` It isn't posted in Discord: ${notPostedReason(night)}.${night === "core" ? " People can answer on the site." : ""}`;
      } else if ((await syncNightPost(nightId)) === "posted") await joinThread(nightId, undefined, [player.id]);
      const posted = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { url: true } });
      done += posted?.url ? ` It's posted: ${posted.url}` : "";
    } catch (err) {
      console.error(`Couldn't post night ${nightId}`, err);
      done += " Its post didn't go up; it'll try again the next time someone answers on the site.";
    }
    await editInteractionReply(i.application_id, i.token, { content: done }).catch((err) => console.error("Couldn't finish the reply", err));
  });
  return deferReply();
}

type PollAction = Extract<NonNullable<ReturnType<typeof parseActionId>>, { kind: "pollVote" | "pollAdd" | "pollPick" | "pollNone" | "pollOff" | "pollReopen" }>;

/** The buttons on the post of a night finding its date, and the question Call it off asks */
async function pollButton(i: Interaction, action: PollAction) {
  // Answers are for whoever the night is for: members for the core group's, anyone for the casual one
  const row = action.kind === "pollVote" ? await pollOfDate(action.optionId) : await ownPoll(action.pollId);
  if (!mayAnswer(i, row.night)) return reply(NOT_THIS_ONE());
  const nightId = row.gameNightId;

  if (action.kind === "pollVote") {
    const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
    const answer = toggleWorks(await answerOf(action.optionId, player.id));
    await setDateAnswer(action.optionId, player.id, answer);
    syncNightPostLater(nightId, answer === "yes" ? { join: player.id } : {});
    return deferUpdate();
  }

  if (action.kind === "pollNone") {
    const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
    await noDatesWork(row.id, player.id);
    syncNightPostLater(nightId);
    return reply("Got it: none of those work for you. If one does after all, tap **Works for me** beside it.");
  }

  if (action.kind === "pollReopen") {
    await reopenPoll(row.id);
    syncNightPostLater(nightId, { say: `↩️ <@${i.member!.user.id}> reopened it.` });
    return deferUpdate();
  }

  const poll = await loadPoll(row.id);
  const n = await ownNight(nightId);
  if (!poll) return reply("That's gone: it was deleted.");
  if (n.cancelled) return reply("That was called off.");
  if (!n.findingDate) return reply("Its date's set already.");
  const title = n.title || NIGHT_NAMES[n.night];

  if (action.kind === "pollAdd") {
    const usual = formatForForm(n.startsAt, TIME_ZONE).time;
    return modal(actionId({ kind: "pollAdd", pollId: poll.id }), "Suggest a date", [
      { id: "date", label: "Date", placeholder: "thu, 11/7 or Nov 7", required: true, maxLength: 40 },
      { id: "time", label: "Time", value: usual, placeholder: "7pm", required: true, maxLength: 20 },
    ]);
  }

  if (action.kind === "pollPick") {
    const ranked = rankDates(poll.dates);
    if (!ranked.length) return reply("Every date on it has gone by. Suggest another first.");
    return modal(actionId({ kind: "pollPick", pollId: poll.id }), "Set the date", [
      {
        id: "date",
        label: "Date",
        description: "Everyone's down as they answered: works is going, if they have to is a maybe.",
        options: ranked.map((d) => ({ label: dateChoiceLabel(d.startsAt, d.yes.length + d.maybe.length, TIME_ZONE), value: String(d.id) })),
        selected: String(ranked[0].id),
      },
    ]);
  }

  if (!action.sure) {
    return ask(`Call off **${escape(title)}** without setting a date? Its post will say so.`, [
      { label: "Call it off", customId: actionId({ kind: "pollOff", pollId: poll.id, sure: true }), danger: true },
    ]);
  }
  await cancelNight(nightId);
  syncNightPostLater(nightId, { say: `❌ <@${i.member!.user.id}> called it off.` });
  return updateReply(`Called off **${escape(title)}**.`);
}

/** The Suggest a date form sent back */
async function suggestDate(i: Interaction, pollId: number, form: Record<string, string>) {
  const when = parseWhen(form.date ?? "", form.time ?? "", new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  const n = await addPollDate(pollId, when.startsAt);
  syncNightPostLater(n.id, { say: `📅 <@${i.member!.user.id}> suggested <t:${unix(when.startsAt)}:F>. Say if it works on the post.` });
  return reply(`Added <t:${unix(when.startsAt)}:F> to **${escape(n.title || NIGHT_NAMES[n.night])}**.`);
}

/** The Set the date form sent back: the night's dated, and its post becomes the night's card */
async function pickDate(i: Interaction, pollId: number, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const optionId = Number(form.date);
  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const { night, going, maybe } = await setPollDate(pollId, optionId);
  announceDateSetLater(night.id, { going, maybe }, { playerId: player.id });
  const plan = SITE_URL && night.night === "core" ? `\nPlan it: ${SITE_URL}/events/${night.id}` : "";
  const coming = going.length + maybe.length;
  return reply(`Set **${escape(night.title)}** for <t:${unix(night.startsAt)}:F>. ${coming ? `${coming} can come, and everyone's down as they answered.` : "Nobody's said it works yet."}${plan}`);
}
