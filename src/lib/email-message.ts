/**
 * What the site emails people: the words, and how they look as plain text and as HTML. Pure, so
 * it's tested; email.ts sends them and event-email.ts decides who gets one.
 *
 * Each message is a draft: what it says about an event, the same for everyone it goes to.
 * buildEmail addresses it to one person, with their own link to stop event emails.
 */

export type Email = {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; contentType: string }[];
};

type Line = string | null | false | undefined;

/** What an email says, before it's addressed to anyone */
export type Draft = {
  subject: string;
  /** The first thing it says, and the preview line in an inbox */
  intro: string;
  /** The event it's about: its name, then when and where */
  card?: { title: string; rows: { label: string; value: string }[] };
  /** Anything after the card, a paragraph each; blank ones are left out */
  lines?: Line[];
  action?: { label: string; url: string };
  /** A quieter link under the button */
  also?: { label: string; url: string };
  /** The event as a calendar file, attached */
  ics?: string;
};

export type Addressing = {
  siteName: string;
  /** Where this person stops emails about events: a page, the address mail apps' own unsubscribe posts to, and their settings. Account emails can't be stopped */
  stop?: { page: string; oneClick: string; settings: string };
};

const C = { felt: "#1e4a3b", feltInk: "#f1f5f2", yellow: "#c9960f", table: "#f6f7f5", card: "#ffffff", ink: "#1b1e22", slate: "#646b73", line: "#e3e5e0", soft: "#f3f6f4" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");
const kept = (lines: Line[] | undefined) => (lines ?? []).filter((l): l is string => Boolean(l));

function htmlBody(d: Draft, to: Addressing) {
  const p = (content: string, style = "") => `<p style="margin:0 0 16px;${style}">${content}</p>`;
  const card = d.card
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:separate;background:${C.soft};border-left:4px solid ${C.yellow};border-radius:8px">
<tr><td style="padding:16px 18px">
<div style="font-size:18px;line-height:1.3;font-weight:700;color:${C.ink};margin:0 0 10px">${html(d.card.title)}</div>
${d.card.rows
  .map(
    (r) =>
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px"><tr><td valign="top" style="width:64px;padding-top:2px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:${C.slate}">${html(r.label)}</td><td style="color:${C.ink}">${html(r.value)}</td></tr></table>`,
  )
  .join("\n")}
</td></tr></table>`
    : "";
  const button = d.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 ${d.also ? "14px" : "4px"}"><tr><td style="border-radius:8px;background:${C.felt}">
<a href="${escapeHtml(d.action.url)}" style="display:inline-block;padding:12px 20px;font-weight:600;color:${C.feltInk};text-decoration:none;border-radius:8px">${html(d.action.label)}</a>
</td></tr></table>`
    : "";
  const also = d.also ? p(`<a href="${escapeHtml(d.also.url)}" style="color:${C.felt}">${html(d.also.label)}</a>`, "margin:0;font-size:14px") : "";
  const footer = to.stop
    ? `You're getting this because you have a ${html(to.siteName)} account.<br><a href="${escapeHtml(to.stop.page)}" style="color:${C.slate}">Stop emails about events</a> &middot; <a href="${escapeHtml(to.stop.settings)}" style="color:${C.slate}">Email settings</a>`
    : `Sent by ${html(to.siteName)}.`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${html(d.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.table}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${html(d.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.table}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.ink}">
<tr><td style="padding:0 4px 12px;font-size:15px;font-weight:800;letter-spacing:-.01em;color:${C.felt}"><span style="color:${C.yellow}">&#9679;</span> ${html(to.siteName)}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:24px">
${p(html(d.intro))}
${card}
${kept(d.lines).map((l) => p(html(l))).join("\n")}
${button}
${also}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:13px;line-height:1.5;color:${C.slate}">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function textBody(d: Draft, to: Addressing) {
  const card = d.card && [d.card.title, ...d.card.rows.map((r) => `${r.label}: ${r.value.replace(/\n/g, "\n  ")}`)].join("\n");
  const footer = to.stop ? `You're getting this because you have a ${to.siteName} account.\nStop emails about events: ${to.stop.page}` : `Sent by ${to.siteName}.`;
  return [d.intro, card, ...kept(d.lines), d.action && `${d.action.label}: ${d.action.url}`, d.also && `${d.also.label}: ${d.also.url}`, `--\n${footer}`]
    .filter(Boolean)
    .join("\n\n");
}

/** A draft, addressed to one person */
export function buildEmail(d: Draft, to: Addressing): Email {
  // A subject is one line: a title with a line break in it can't add headers of its own
  const subject = d.subject.replace(/\s+/g, " ").trim().slice(0, 150);
  return {
    subject,
    text: textBody(d, to),
    html: htmlBody({ ...d, subject }, to),
    // Mail apps show their own unsubscribe for it, which turns event emails off without signing in
    ...(to.stop && { headers: { "List-Unsubscribe": `<${to.stop.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
    ...(d.ics && { attachments: [{ filename: "event.ics", content: d.ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }] }),
  };
}

const clock = (d: Date, timeZone: string) => d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const dayOf = (d: Date, timeZone: string) => d.toLocaleDateString("en-CA", { timeZone });
const longDate = (d: Date, timeZone: string) => d.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" });

/** A moment as the group reads it: "Thursday, October 29 at 7:00 PM CDT" */
export function emailWhen(at: Date | string, timeZone: string) {
  const d = new Date(at);
  return `${longDate(d, timeZone)} at ${clock(d, timeZone)}`;
}

/** How soon, for a reminder: "tonight at 6:30 PM CST", "today at 1:00 PM CST", "tomorrow at …", or the date */
export function emailSoon(at: Date | string, timeZone: string, now = new Date()) {
  const d = new Date(at);
  if (dayOf(d, timeZone) === dayOf(now, timeZone)) {
    const hour = Number(d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }));
    return `${hour >= 17 ? "tonight" : "today"} at ${clock(d, timeZone)}`;
  }
  if (dayOf(d, timeZone) === dayOf(new Date(now.getTime() + 24 * 3_600_000), timeZone)) return `tomorrow at ${clock(d, timeZone)}`;
  return emailWhen(d, timeZone);
}

/** What every event email needs: the group's time zone, the event's page, and its calendar page and file once it has a date */
export type Frame = { timeZone: string; url: string; calendar?: { url: string; ics: string } | null };

type Night = { title: string; startsAt: Date | string; location: string | null };

const rows = (n: Night, f: Frame) => [{ label: "When", value: emailWhen(n.startsAt, f.timeZone) }, ...(n.location ? [{ label: "Where", value: n.location }] : [])];
const event = (n: Night, f: Frame) => ({ title: n.title, rows: rows(n, f) });
const addToCalendar = (f: Frame) => (f.calendar ? { also: { label: "Add it to your calendar", url: f.calendar.url }, ics: f.calendar.ics } : {});
const see = (f: Frame) => ({ label: "See the event", url: f.url });

/** "Azul", "Azul and Cascadia", "Azul, Cascadia and Root" */
const andList = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** A new event */
export const nightMade = (n: Night & { by: string }, f: Frame): Draft => ({
  subject: `New event: ${n.title}`,
  intro: `${n.by} added a new event. Can you make it?`,
  card: event(n, f),
  action: { label: `Let ${n.by} know`, url: f.url },
  ...addToCalendar(f),
});

/** A new event picking its date */
export const pollStarted = (n: { title: string; by: string; location: string | null; dates: (Date | string)[] }, f: Frame): Draft => ({
  subject: `Which dates work for ${n.title}?`,
  intro: `${n.by} is trying to find a date for ${n.title}. Which of these work for you?`,
  card: {
    title: n.title,
    rows: [
      { label: n.dates.length === 1 ? "Date" : "Dates", value: n.dates.map((d) => emailWhen(d, f.timeZone)).join("\n") },
      ...(n.location ? [{ label: "Where", value: n.location }] : []),
    ],
  },
  action: { label: "Pick your dates", url: f.url },
});

/** Someone who hasn't said which dates work, nudged by `by` */
export const datesNudge = (n: { title: string; by: string }, f: Frame): Draft => ({
  subject: `Which dates work for ${n.title}?`,
  intro: `${n.by} is still waiting on your dates for ${n.title}.`,
  action: { label: "Pick your dates", url: f.url },
});

/** To whoever started it: everyone's answered, or the day to decide by is here. `best`: the date most people can make so far */
export const pollReady = (n: { title: string; why: "answered" | "decide"; best: { when: string; coming: number } | null; waiting: number }, f: Frame): Draft => ({
  subject: n.why === "answered" ? `Everyone's answered for ${n.title}` : `Time to pick a date for ${n.title}`,
  intro: n.why === "answered" ? `Everyone's said which dates work for ${n.title}, so you can pick one.` : `Today's the day you said you'd pick a date for ${n.title}.`,
  lines: [
    n.best && `${n.best.when} works for the most people so far (${n.best.coming}).`,
    n.why === "decide" && n.waiting > 0 && `${n.waiting === 1 ? "1 person still hasn't" : `${n.waiting} people still haven't`} answered.`,
  ],
  action: { label: "Pick the date", url: f.url },
});

const YOUR_ANSWER = {
  going: "You said that date works, so you're going.",
  maybe: "You said maybe to that date, so you're a maybe for now.",
  declined: "You said that date doesn't work, so you're marked as not going.",
} as const;

/** Its date is set. `status` is what their answer to that date made them, if they gave one */
export const dateSet = (n: Night & { status: "going" | "maybe" | "declined" | null }, f: Frame): Draft => ({
  subject: `${n.title} is on ${longDate(new Date(n.startsAt), f.timeZone)}`,
  intro: `${n.title} has a date. ${n.status ? YOUR_ANSWER[n.status] : "Can you make it?"}`,
  card: event(n, f),
  action: n.status === "going" ? see(f) : { label: n.status ? "Change your answer" : "Answer", url: f.url },
  ...(n.status !== "declined" && addToCalendar(f)),
});

/** Its date fell through, and it's picking another */
export const dateFellThrough = (n: { title: string; was: Date | string }, f: Frame): Draft => ({
  subject: `${n.title} needs a new date`,
  intro: `${emailWhen(n.was, f.timeZone)} fell through for ${n.title}. Which of the other dates work for you?`,
  action: { label: "Pick your dates", url: f.url },
});

/** It moved, or is somewhere else. Null when nothing people would notice changed */
export function nightChanged(before: Night, after: Night & { by: string }, f: Frame): Draft | null {
  const moved = new Date(before.startsAt).getTime() !== new Date(after.startsAt).getTime();
  const placed = (before.location ?? "") !== (after.location ?? "");
  if (!moved && !placed) return null;
  const intro =
    moved && placed
      ? `${after.by} changed when and where ${after.title} is.`
      : moved
        ? `${after.by} moved ${after.title} to ${emailWhen(after.startsAt, f.timeZone)}.`
        : after.location
          ? `${after.by} moved ${after.title} to ${after.location}.`
          : `${after.by} cleared the place for ${after.title}.`;
  return {
    subject: moved && !placed ? `${after.title} has a new time` : placed && !moved ? `${after.title} has moved` : `${after.title} has changed`,
    intro,
    card: event(after, f),
    lines: [moved && `It was ${emailWhen(before.startsAt, f.timeZone)}.`, placed && before.location && `It was at ${before.location}.`],
    action: see(f),
    // The same event in their calendar moves with it
    ...addToCalendar(f),
  };
}

/** Called off, or back on after being called off */
export const nightOff = (n: { title: string; by: string; on: boolean; startsAt?: Date | string | null }, f: Frame): Draft => {
  const when = n.startsAt && emailWhen(n.startsAt, f.timeZone);
  return n.on
    ? { subject: `${n.title} is back on`, intro: `${n.by} put ${n.title} back on${when ? ` for ${when}` : ""}. Can you still make it?`, action: { label: "Answer", url: f.url } }
    : { subject: `${n.title} is off`, intro: `${n.by} called off ${n.title}${when ? `, planned for ${when}` : ""}.` };
};

export const seatOpened = (n: Night, f: Frame): Draft => ({
  subject: `A seat opened up: ${n.title}`,
  intro: `A seat opened up at ${n.title} and you were next on the waitlist, so you're in.`,
  card: event(n, f),
  action: see(f),
  ...addToCalendar(f),
});

/** A few hours before. `now` is when it's sent, for "tonight" or "tomorrow" */
export const reminder = (n: Night & { status: "going" | "maybe"; bringing: string[] }, f: Frame, now = new Date()): Draft => {
  const soon = emailSoon(n.startsAt, f.timeZone, now);
  return {
    subject: `${soon[0].toUpperCase()}${soon.slice(1)}: ${n.title}`,
    intro: n.status === "maybe" ? `${n.title} is ${soon}, and you're still a maybe. Can you make it?` : `${n.title} is ${soon}.`,
    card: event(n, f),
    lines: [n.bringing.length > 0 && `You said you'd bring ${andList(n.bringing)}.`],
    action: n.status === "maybe" ? { label: "Answer", url: f.url } : see(f),
  };
};

/** The morning after, to whoever made it, with nothing logged */
export const logNudge = (n: { title: string }, f: Frame): Draft => ({
  subject: `What got played at ${n.title}?`,
  intro: `Nobody's logged the games from ${n.title} yet. Can you add them?`,
  action: { label: "Log the games", url: f.url },
});

/** After a casual night, the games someone hasn't rated */
export const rateNudge = (n: { title: string; games: string[] }, f: Frame): Draft => ({
  subject: `What did you think of ${andList(n.games)}?`,
  intro: `Thanks for coming to ${n.title}. How did you like ${andList(n.games)}?`,
  lines: ["Your ratings help pick games for next time."],
  action: { label: "Rate them", url: f.url },
});

export const bringAsk = (n: Night & { by: string; game: string }, f: Frame): Draft => ({
  subject: `Can you bring ${n.game}?`,
  intro: `${n.by} asked if you could bring ${n.game} to ${n.title}.`,
  card: event(n, f),
  action: { label: `Answer ${n.by}`, url: f.url },
});

/** An admin made someone a member, so they see the group's own events too. `night`: what those are called, when there's a casual night as well */
export const madeMember = (n: { by: string; night: string | null }, f: Pick<Frame, "url">): Draft => ({
  subject: n.night ? `You're in for ${n.night}` : "You're a member now",
  intro: n.night ? `${n.by} added you to ${n.night}, so you'll see those events on the site now.` : `${n.by} made you a member of the group.`,
  lines: ["If you haven't yet, take a few minutes to rate and rank the games you've played."],
  action: { label: "Get set up", url: f.url },
});

/** For a forgotten password */
export const passwordReset = (n: { name: string; siteName: string }, f: Pick<Frame, "url">): Draft => ({
  subject: `Reset your ${n.siteName} password`,
  intro: `Hi ${n.name}, here's the link to choose a new password. It works once, for the next 24 hours.`,
  lines: ["Didn't ask for this? Ignore it and your password won't change."],
  action: { label: "Choose a new password", url: f.url },
});

/** `password`: they sign in with one, so a confirmed address is also how they reset it */
export const confirmEmail = (n: { name: string; siteName: string; password: boolean }, f: Pick<Frame, "url">): Draft => ({
  subject: `Confirm your email for ${n.siteName}`,
  intro: `Hi ${n.name}, can you confirm this is your email address?`,
  lines: [`Once it's confirmed, you'll get emails about events${n.password ? ", and you can reset your password if you forget it" : ""}.`, `Didn't sign up for ${n.siteName}? You can ignore this.`],
  action: { label: "Confirm my email", url: f.url },
});
