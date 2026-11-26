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
  card?: { title: string; rows: { label: string; value: string }[]; note?: Line };
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
${d.card.note ? `<div style="margin:10px 0 0;font-weight:600;color:${C.felt}">${html(d.card.note)}</div>` : ""}
</td></tr></table>`
    : "";
  const button = d.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 ${d.also ? "14px" : "4px"}"><tr><td style="border-radius:8px;background:${C.felt}">
<a href="${escapeHtml(d.action.url)}" style="display:inline-block;padding:12px 20px;font-weight:600;color:${C.feltInk};text-decoration:none;border-radius:8px">${html(d.action.label)}</a>
</td></tr></table>`
    : "";
  const also = d.also ? p(`<a href="${escapeHtml(d.also.url)}" style="color:${C.felt}">${html(d.also.label)}</a>`, "margin:0;font-size:14px") : "";
  const footer = to.stop
    ? `You're getting this because you have an account on ${html(to.siteName)}.<br><a href="${escapeHtml(to.stop.page)}" style="color:${C.slate}">Stop emails about events</a> &middot; <a href="${escapeHtml(to.stop.settings)}" style="color:${C.slate}">Email settings</a>`
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
  const card = d.card && [d.card.title, ...d.card.rows.map((r) => `${r.label}: ${r.value.replace(/\n/g, "\n  ")}`), d.card.note].filter(Boolean).join("\n");
  const footer = to.stop ? `You're getting this because you have an account on ${to.siteName}.\nStop emails about events: ${to.stop.page}` : `Sent by ${to.siteName}.`;
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
const event = (n: Night, f: Frame, note?: Line) => ({ title: n.title, rows: rows(n, f), note });
const addToCalendar = (f: Frame) => (f.calendar ? { also: { label: "Add it to your calendar", url: f.calendar.url }, ics: f.calendar.ics } : {});
const see = (f: Frame) => ({ label: "See the event", url: f.url });

/** A new event */
export const nightMade = (n: Night & { by: string }, f: Frame): Draft => ({
  subject: `New event: ${n.title}`,
  intro: `${n.by} added an event. Say if you're coming, so they know who to expect.`,
  card: event(n, f),
  action: { label: "Say if you're coming", url: f.url },
  ...addToCalendar(f),
});

/** A new event picking its date */
export const pollStarted = (n: { title: string; by: string; location: string | null; dates: (Date | string)[] }, f: Frame): Draft => ({
  subject: `Which dates work for ${n.title}?`,
  intro: `${n.by} is finding a date for ${n.title}. Say which of these work for you.`,
  card: {
    title: n.title,
    rows: [
      { label: n.dates.length === 1 ? "Date" : "Dates", value: n.dates.map((d) => emailWhen(d, f.timeZone)).join("\n") },
      ...(n.location ? [{ label: "Where", value: n.location }] : []),
    ],
  },
  action: { label: "Say which dates work", url: f.url },
});

/** Someone who hasn't said which dates work, nudged by `by` */
export const datesNudge = (n: { title: string; by: string }, f: Frame): Draft => ({
  subject: `Which dates work for ${n.title}?`,
  intro: `${n.by} is waiting to hear which dates work for you for ${n.title}. It's a tap for each date.`,
  action: { label: "Say which dates work", url: f.url },
});

/** To whoever started it: everyone's answered, or the day to decide by is here */
export const pollReady = (n: { title: string; why: "answered" | "decide"; best: string | null; waiting: number }, f: Frame): Draft => ({
  subject: n.why === "answered" ? `Everyone's answered for ${n.title}` : `Time to pick a date for ${n.title}`,
  intro: n.why === "answered" ? `Everyone's said which dates work for ${n.title}, so it's ready for you to set the date.` : `You said you'd pick a date for ${n.title} today.`,
  lines: [n.best && `Best so far: ${n.best}.`, n.why === "decide" && n.waiting > 0 && `${n.waiting} ${n.waiting === 1 ? "person hasn't" : "people haven't"} answered yet.`],
  action: { label: "Set the date", url: f.url },
});

const DOWN_AS = { going: "You're down as going.", maybe: "You're down as a maybe.", declined: "You're down as can't make it." } as const;

/** Its date is set. `status` is what their answer to that date made them, if they gave one */
export const dateSet = (n: Night & { status: "going" | "maybe" | "declined" | null }, f: Frame): Draft => ({
  subject: `${n.title} is on ${longDate(new Date(n.startsAt), f.timeZone)}`,
  intro: n.status ? `${n.title} has its date, and you're down from what you said worked.` : `${n.title} has its date. Say if you're coming.`,
  card: event(n, f, n.status && DOWN_AS[n.status]),
  action: n.status ? see(f) : { label: "Say if you're coming", url: f.url },
  ...(n.status !== "declined" && addToCalendar(f)),
});

/** Its date fell through, and it's picking another */
export const dateFellThrough = (n: { title: string; was: Date | string }, f: Frame): Draft => ({
  subject: `${n.title}: that date fell through`,
  intro: `${emailWhen(n.was, f.timeZone)} fell through for ${n.title}, so it's picking another date. Say which of the others work for you.`,
  action: { label: "Say which dates work", url: f.url },
});

/** It moved, or is somewhere else. Null when nothing people would notice changed */
export function nightChanged(before: Night, after: Night & { by: string }, f: Frame): Draft | null {
  const moved = new Date(before.startsAt).getTime() !== new Date(after.startsAt).getTime();
  const placed = (before.location ?? "") !== (after.location ?? "");
  if (!moved && !placed) return null;
  const what = moved && placed ? "when and where it is" : moved ? "when it is" : "where it is";
  return {
    subject: `Changed: ${after.title}`,
    intro: `${after.by} changed ${what}.`,
    card: {
      title: after.title,
      rows: [
        { label: moved ? "Now" : "When", value: emailWhen(after.startsAt, f.timeZone) },
        ...(after.location || placed ? [{ label: placed ? "Now at" : "Where", value: after.location ?? "No place set yet" }] : []),
      ],
      note: [moved && `It was ${emailWhen(before.startsAt, f.timeZone)}.`, placed && before.location && `It was at ${before.location}.`].filter(Boolean).join(" ") || null,
    },
    action: see(f),
    // The same event in their calendar moves with it
    ...addToCalendar(f),
  };
}

/** Called off, or back on after being called off */
export const nightOff = (n: { title: string; by: string; on: boolean; startsAt?: Date | string | null }, f: Frame): Draft => ({
  subject: `${n.on ? "Back on" : "Called off"}: ${n.title}`,
  intro: n.on ? `${n.by} put ${n.title} back on.` : `${n.by} called off ${n.title}.`,
  lines: [n.startsAt && `It was set for ${emailWhen(n.startsAt, f.timeZone)}.`],
  action: n.on ? { label: "Say if you're coming", url: f.url } : undefined,
});

export const seatOpened = (n: Night, f: Frame): Draft => ({
  subject: `You're in: ${n.title}`,
  intro: "A seat opened up, so you're going.",
  card: event(n, f, DOWN_AS.going),
  action: see(f),
  ...addToCalendar(f),
});

/** A few hours before. `now` is when it's sent, for "tonight" or "tomorrow" */
export const reminder = (n: Night & { status: "going" | "maybe"; bringing: string[] }, f: Frame, now = new Date()): Draft => {
  const soon = emailSoon(n.startsAt, f.timeZone, now);
  return {
    subject: `${soon[0].toUpperCase()}${soon.slice(1)}: ${n.title}`,
    intro: `${n.title} is ${soon}.`,
    card: event(n, f, DOWN_AS[n.status]),
    lines: [n.bringing.length > 0 && `Don't forget to bring ${n.bringing.join(", ")}.`, n.status === "maybe" && "Still a maybe? Say if you're coming, so the table's set for the right number."],
    action: n.status === "maybe" ? { label: "Say if you're coming", url: f.url } : see(f),
  };
};

/** The morning after, to whoever made it, with nothing logged */
export const logNudge = (n: { title: string }, f: Frame): Draft => ({
  subject: `How did ${n.title} go?`,
  intro: `Nothing's logged for ${n.title} yet. Tick the games you played and add any that weren't on the list, so the group's plays and rankings stay right.`,
  action: { label: "Log what you played", url: f.url },
});

/** After a casual night, the games someone hasn't rated */
export const rateNudge = (n: { title: string; games: string[] }, f: Frame): Draft => ({
  subject: `What did you think of ${n.games.length === 1 ? n.games[0] : "the games"}?`,
  intro: `Thanks for coming to ${n.title}. You played ${n.games.join(", ")}.`,
  lines: ["A tap each says how you liked them, so the next one is planned with what you enjoy."],
  action: { label: "Rate what you played", url: f.url },
});

export const bringAsk = (n: Night & { by: string; game: string }, f: Frame): Draft => ({
  subject: `Can you bring ${n.game}?`,
  intro: `${n.by} asked if you'd bring ${n.game}.`,
  card: event(n, f),
  action: { label: "Answer", url: f.url },
});

/** An admin made someone a member, so they see the group's own events too. `night`: what those are called, when there's a casual night as well */
export const madeMember = (n: { by: string; night: string | null }, f: Pick<Frame, "url">): Draft => ({
  subject: n.night ? `You're in for ${n.night}` : "You're a member now",
  intro: n.night ? `${n.by} made you a member, so ${n.night} events are open to you now too.` : `${n.by} made you a member of the group.`,
  lines: ["A few minutes getting set up helps the group pick games you'll enjoy."],
  action: { label: "Get set up", url: f.url },
});

/** For a forgotten password */
export const passwordReset = (n: { name: string; siteName: string }, f: Pick<Frame, "url">): Draft => ({
  subject: `Choose a new password for ${n.siteName}`,
  intro: `Hi ${n.name}. Someone, hopefully you, asked for a new password on ${n.siteName}.`,
  lines: ["The link works once, for a day. If it wasn't you, ignore this: your password stays as it is."],
  action: { label: "Choose a new password", url: f.url },
});

/** `password`: they sign in with one, so a confirmed address is also how they get back in */
export const confirmEmail = (n: { name: string; siteName: string; password: boolean }, f: Pick<Frame, "url">): Draft => ({
  subject: `Confirm your email for ${n.siteName}`,
  intro: `Hi ${n.name}. Confirm this is your address to get emails about events${n.password ? ", and to get back in if you forget your password" : ""}.`,
  lines: [`If you don't know ${n.siteName}, ignore this.`],
  action: { label: "Confirm it", url: f.url },
});
