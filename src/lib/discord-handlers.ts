import "server-only";
import { after } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { CASUAL_NIGHT, GROUP_NIGHTS, NIGHT_NAMES, SITE_NAME, SITE_URL, TIME_ZONE } from "@/config";
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
import { answerBringAsk, cancelNight, createNight, editNight, ownNight, playerForDiscordUser, playerNamed, setRsvp } from "./night-store";
import { joinThread, postInThread, syncNightPost, syncNightPostLater, upcomingOwnNights } from "./night-post";
import { localDate, nightTitle, nightWhen } from "./nights";
import { inSentence } from "./text";
import { formatForForm, parseDateList, parseTime, parseWhen } from "./when";
import { addPollDate, cancelPoll, createPoll, loadPoll, ownPoll, pickPollDate, reopenPoll, setPollVote } from "./poll-store";
import { announcePickedLater, joinPollThread, pollTitle, syncPollPost, syncPollPostLater } from "./poll-post";
import { dateChoiceLabel, rankDates } from "./poll-message";
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

/** Members of the group: anyone in the server, or holders of DISCORD_MEMBER_ROLE_ID when it's set */
function isMember(i: Interaction) {
  const role = process.env.DISCORD_MEMBER_ROLE_ID;
  return !role || Boolean(i.member?.roles.includes(role));
}

/** The core group's nights are for members; the casual night is for anyone in the server */
const mayAnswer = (i: Interaction, night: Night) => night === "casual" || isMember(i);

/**
 * Said to someone without the member role who tries something that needs it. Only reached when
 * there is a role, so it can name it (a mention, which shows the role's name without pinging).
 */
const roleNeeded = () => `<@&${process.env.DISCORD_MEMBER_ROLE_ID}>`;
const MEMBERS_ONLY = () => `That needs the ${roleNeeded()} role.`;

/** Everyone's welcome at the casual night; this is a core group's night, and anyone with the role can invite them */
const NOT_THIS_ONE = () => `This one's for the ${roleNeeded()} role. If you're keen, anyone with it can invite you.`;

async function command(i: Interaction) {
  if (i.data?.name === welcomeName()) return welcomeCommand(i);
  if (i.data?.name !== commandName()) return reply("That command isn't mine.");
  const { sub, values } = commandOptions(i.data.options);
  if (!isMember(i)) return reply(MEMBERS_ONLY());
  if (sub === "new") return newNightForm(i);
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
      .map((n) => ({ name: `${nightWhen(n.startsAt.toISOString(), TIME_ZONE).label} · ${n.title}`, value: String(n.id) }))
      .filter((c) => !typed || c.name.toLowerCase().includes(typed)),
  );
}

async function component(i: Interaction) {
  const action = parseActionId(i.data?.custom_id);
  if (!action || action.kind === "new" || action.kind === "newPoll") return reply("That button is from an older version. The event's post has the current ones.");
  if (action.kind === "welcome") return welcomeConfirmed(i, action.userId);
  if (action.kind === "bring") return bringAnswer(i, action);
  if (action.kind === "pollVote" || action.kind === "pollAdd" || action.kind === "pollPick" || action.kind === "pollOff" || action.kind === "pollReopen") return pollButton(i, action);
  const n = await ownNight(action.nightId);

  if (action.kind === "rsvp") {
    if (!mayAnswer(i, n.night)) return reply(NOT_THIS_ONE());
    const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
    await setRsvp({ nightId: n.id, playerId: player.id, status: action.status, via: "discord" });
    syncNightPostLater(n.id, { join: player.id });
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

  // Confirmed from /night cancel
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
  if (action?.kind === "new") return newNight(i, form);
  if (action?.kind === "newPoll") return newPoll(i, form);
  if (action?.kind === "pollAdd") return suggestDate(i, action.pollId, form);
  if (action?.kind === "pollPick") return pickDate(i, action.pollId, form);
  if (action?.kind !== "edit") return reply("That form is from an older version. Try again.");

  const n = await ownNight(action.nightId);
  const shown = formatForForm(n.startsAt, TIME_ZONE);
  const when = parseWhen(form.date || shown.date, form.time || shown.time, new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  const seats = form.seats ? Number(form.seats) : null;
  if (seats !== null && !(Number.isInteger(seats) && seats > 0 && seats <= 100)) return reply("Seats should be a number, or empty for no limit.");

  const before = await editNight(n.id, { title: form.title || n.title, startsAt: when.startsAt, location: form.location || null, capacity: seats });
  syncNightPostLater(n.id, { note: { before, by: { name: memberName(i), discordId: i.member!.user.id } } });
  return reply(`Saved: **${form.title || n.title}**, <t:${unix(when.startsAt)}:F>${form.location ? ` at ${form.location}` : ""}.`);
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
  await setRsvp({ nightId: n.id, playerId, status: answer.status, via: "discord" });
  syncNightPostLater(n.id, { join: playerId });
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
  const role = process.env.DISCORD_MEMBER_ROLE_ID;
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
 * /night new opens the form, as the kind of night whose channel it was used in, with the
 * last night of that kind's time and place filled in
 */
async function newNightForm(i: Interaction) {
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
  return modal(actionId({ kind: "new" }), "New event", fields);
}

/** The /night new form sent back: make the night, then post it */
async function newNight(i: Interaction, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const night: Night = CASUAL_NIGHT && NIGHTS.includes(form.kind as Night) ? (form.kind as Night) : "core";

  const when = parseWhen(form.date ?? "", form.time ?? "", new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  if (when.startsAt.getTime() < Date.now()) return reply(`<t:${unix(when.startsAt)}:F> has already started. Pick a time that's coming up.`);

  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const title = form.title || nightTitle(night, when.date);
  const location = form.location || null;
  const row = await createNight({ night, title, startsAt: when.startsAt, location }, userId);

  // Posting takes a few calls to Discord, so the reply comes once it's up
  after(async () => {
    let done = `Made **${title}** (${NIGHT_NAMES[night]}), <t:${unix(when.startsAt)}:F>${location ? ` at ${location}` : ""}.`;
    try {
      if (!postsNights(night)) {
        // Saved, but there's nowhere to post it: say so, rather than leave people looking for a post
        const setting = eventsChannel(night) ? "DISCORD_BOT_TOKEN" : night === "casual" ? "DISCORD_CASUAL_EVENTS_CHANNEL_ID" : "DISCORD_CORE_EVENTS_CHANNEL_ID";
        done += ` It isn't posted in Discord: ${setting} isn't set.`;
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

// Polls to find a date: the core group's nights only, so they're for members

/** /event poll opens the form, with the last night's time and place filled in */
async function newPollForm(i: Interaction) {
  if (!(await accountFor(i))) return signInFirst();
  if (!postsNights("core")) return reply("Polls are posted in the events channel, and DISCORD_CORE_EVENTS_CHANNEL_ID isn't set. Start one on Plan instead.");
  const last = await lastNight("core");
  return modal(actionId({ kind: "newPoll" }), "Find a date", [
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
    { id: "title", label: "Title", placeholder: `Optional: what the ${inSentence(NIGHT_NAMES.core)} will be called`, maxLength: 100 },
    { id: "location", label: "Where", value: last.location ?? undefined, maxLength: 100 },
  ]);
}

/** The /event poll form sent back: save the poll, then post it */
async function newPoll(i: Interaction, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const time = parseTime(form.time ?? "");
  if (!time) return reply(`Couldn't read "${form.time}" as a time. Try 7pm or 19:00.`);
  const dates = parseDateList(form.dates ?? "", time, new Date(), TIME_ZONE, POLL_MAX_DATES);
  if ("error" in dates) return reply(dates.error);

  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const row = await createPoll({ night: "core", title: form.title || null, location: form.location || null, dates: dates.map((d) => d.startsAt) }, userId);
  const title = pollTitle(row);

  after(async () => {
    let done = `Offered ${dates.length} ${dates.length === 1 ? "date" : "dates"} for **${escape(title)}**: ${dates.map((d) => `<t:${unix(d.startsAt)}:F>`).join(", ")}.`;
    try {
      if ((await syncPollPost(row.id)) === "posted") await joinPollThread(row.id, [player.id]);
      const posted = await db.query.datePoll.findFirst({ where: eq(schema.datePoll.id, row.id), columns: { url: true } });
      done += posted?.url ? ` It's posted: ${posted.url}` : "";
    } catch (err) {
      console.error(`Couldn't post poll ${row.id}`, err);
      done += " Its post didn't go up; it'll try again the next time someone votes on the site.";
    }
    await editInteractionReply(i.application_id, i.token, { content: done }).catch((err) => console.error("Couldn't finish the reply", err));
  });
  return deferReply();
}

type PollAction = Extract<NonNullable<ReturnType<typeof parseActionId>>, { kind: "pollVote" | "pollAdd" | "pollPick" | "pollOff" | "pollReopen" }>;

/** The buttons on a poll's post, and the question Call it off asks */
async function pollButton(i: Interaction, action: PollAction) {
  if (!isMember(i)) return reply(NOT_THIS_ONE());

  if (action.kind === "pollVote") {
    const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
    const { pollId, on } = await setPollVote(action.optionId, player.id);
    syncPollPostLater(pollId, on ? { join: player.id } : {});
    return deferUpdate();
  }

  if (action.kind === "pollReopen") {
    await reopenPoll(action.pollId);
    syncPollPostLater(action.pollId, { note: `↩️ <@${i.member!.user.id}> reopened it.` });
    return deferUpdate();
  }

  const poll = await loadPoll(action.pollId);
  if (!poll) return reply("That poll's gone.");
  if (poll.status !== "open") return reply(poll.status === "picked" ? "A date's already been picked for that." : "That poll's over.");
  const title = pollTitle(poll);

  if (action.kind === "pollAdd") {
    const usual = poll.dates[0] ? formatForForm(new Date(poll.dates[0].startsAt), TIME_ZONE).time : "7:00 pm";
    return modal(actionId({ kind: "pollAdd", pollId: poll.id }), "Suggest a date", [
      { id: "date", label: "Date", placeholder: "thu, 11/7 or Nov 7", required: true, maxLength: 40 },
      { id: "time", label: "Time", value: usual, placeholder: "7pm", required: true, maxLength: 20 },
    ]);
  }

  if (action.kind === "pollPick") {
    const ranked = rankDates(poll.dates);
    if (!ranked.length) return reply("Every date on it has gone by. Suggest another first.");
    return modal(actionId({ kind: "pollPick", pollId: poll.id }), "Pick the date", [
      {
        id: "date",
        label: "Date",
        description: "Picking it makes the event, and asks the people it works for if they're coming.",
        options: ranked.map((d) => ({ label: dateChoiceLabel(d.startsAt, d.voters.length, TIME_ZONE), value: String(d.id) })),
        selected: String(ranked[0].id),
      },
      { id: "title", label: "Title", value: poll.title ?? undefined, placeholder: `Empty: "${nightTitle(poll.night, localDate(new Date(ranked[0].startsAt)))}", with its date`, maxLength: 100 },
      { id: "location", label: "Where", value: poll.location ?? undefined, maxLength: 100 },
    ]);
  }

  if (!action.sure) {
    return ask(`Call off **${escape(title)}** without picking a date? Its post will say so.`, [
      { label: "Call it off", customId: actionId({ kind: "pollOff", pollId: poll.id, sure: true }), danger: true },
    ]);
  }
  await cancelPoll(poll.id);
  syncPollPostLater(poll.id, { note: `❌ <@${i.member!.user.id}> called it off.` });
  return updateReply(`Called off **${escape(title)}**.`);
}

/** The Suggest a date form sent back */
async function suggestDate(i: Interaction, pollId: number, form: Record<string, string>) {
  const when = parseWhen(form.date ?? "", form.time ?? "", new Date(), TIME_ZONE);
  if ("error" in when) return reply(when.error);
  const row = await addPollDate(pollId, when.startsAt);
  syncPollPostLater(pollId, { note: `📅 <@${i.member!.user.id}> suggested <t:${unix(when.startsAt)}:F>.` });
  return reply(`Added <t:${unix(when.startsAt)}:F> to **${escape(pollTitle(row))}**.`);
}

/** The Pick the date form sent back: the night's made, and the poll's post becomes its post */
async function pickDate(i: Interaction, pollId: number, form: Record<string, string>) {
  const userId = await accountFor(i);
  if (!userId) return signInFirst();
  const poll = await ownPoll(pollId);
  const optionId = Number(form.date);
  const option = await db.query.datePollOption.findFirst({ where: and(eq(schema.datePollOption.id, optionId), eq(schema.datePollOption.pollId, pollId)) });
  if (!option) return reply("Pick a date from the list.");
  const title = form.title || poll.title || nightTitle(poll.night, localDate(option.startsAt));
  const player = await playerForDiscordUser(i.member!.user.id, memberName(i));
  const { night } = await pickPollDate(pollId, optionId, { title, location: form.location || null }, userId);
  announcePickedLater(pollId, optionId, { playerId: player.id });
  const plan = SITE_URL ? `\nPlan it: ${SITE_URL}/events/${night.id}` : "";
  return reply(`Picked <t:${unix(option.startsAt)}:F> for **${escape(title)}**. The poll's post is the event now; people answer on it.${plan}`);
}
