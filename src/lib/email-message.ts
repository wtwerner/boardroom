/**
 * What the site emails people: the words, as plain text and as simple HTML. Pure, so it's
 * tested; email.ts sends them and event-email.ts decides who gets one.
 */

export type Email = { subject: string; text: string; html: string };

export type EmailParts = {
  subject: string;
  /** A line or a paragraph each; blank ones are left out */
  lines: (string | null | false | undefined)[];
  action?: { label: string; url: string };
  /** Why they're getting it, and where to stop it. Account emails can't be stopped, so they leave it out */
  settingsUrl?: string;
  siteName: string;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildEmail(e: EmailParts): Email {
  const lines = e.lines.filter((l): l is string => Boolean(l));
  const footer = e.settingsUrl ? `You're getting this from ${e.siteName}. To stop emails about events: ${e.settingsUrl}` : `Sent by ${e.siteName}.`;
  const text = [...lines, e.action && `${e.action.label}: ${e.action.url}`, `--\n${footer}`].filter(Boolean).join("\n\n");
  const p = (content: string, style = "margin:0 0 14px") => `<p style="${style}">${content}</p>`;
  const html = [
    `<div style="font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:34rem;margin:0 auto;padding:16px">`,
    ...lines.map((l) => p(escapeHtml(l).replace(/\n/g, "<br>"))),
    e.action && p(`<a href="${escapeHtml(e.action.url)}" style="display:inline-block;background:#1f4d3a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">${escapeHtml(e.action.label)}</a>`, "margin:20px 0"),
    p(
      e.settingsUrl
        ? `You're getting this from ${escapeHtml(e.siteName)}. <a href="${escapeHtml(e.settingsUrl)}">Stop emails about events</a>`
        : escapeHtml(footer),
      "margin:24px 0 0;font-size:13px;color:#667",
    ),
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
  // A subject is one line: a title with a line break in it can't add headers of its own
  return { subject: e.subject.replace(/\s+/g, " ").trim().slice(0, 150), text, html };
}

/** A moment as the group reads it: "Thursday, October 29 at 7:00 PM CDT" */
export function emailWhen(at: Date | string, timeZone: string) {
  const d = typeof at === "string" ? new Date(at) : at;
  const day = d.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${day} at ${time}`;
}

type Night = { title: string; startsAt: Date | string; location: string | null };
type Frame = { siteName: string; timeZone: string; url: string; settingsUrl: string };

const whenWhere = (n: Night, f: Frame) => [emailWhen(n.startsAt, f.timeZone), n.location].filter(Boolean).join("\n");
const frame = (f: Frame, rest: Omit<EmailParts, "siteName" | "settingsUrl">) => buildEmail({ ...rest, siteName: f.siteName, settingsUrl: f.settingsUrl });

/** A new event */
export const nightMade = (n: Night & { by: string }, f: Frame) =>
  frame(f, { subject: `New event: ${n.title}`, lines: [`${n.by} added ${n.title}.`, whenWhere(n, f)], action: { label: "Say if you're coming", url: f.url } });

/** A new event picking its date */
export const pollStarted = (n: { title: string; by: string; location: string | null; dates: (Date | string)[] }, f: Frame) =>
  frame(f, {
    subject: `Which dates work for ${n.title}?`,
    lines: [`${n.by} is finding a date for ${n.title}${n.location ? ` at ${n.location}` : ""}.`, n.dates.map((d) => emailWhen(d, f.timeZone)).join("\n")],
    action: { label: "Say which dates work", url: f.url },
  });

/** Someone who hasn't said which dates work, nudged by `by` */
export const datesNudge = (n: { title: string; by: string }, f: Frame) =>
  frame(f, { subject: `Which dates work for ${n.title}?`, lines: [`${n.by} is waiting to hear which dates work for you for ${n.title}.`], action: { label: "Say which dates work", url: f.url } });

/** To whoever started it: everyone's answered, or the day to decide by is here */
export const pollReady = (n: { title: string; why: "answered" | "decide"; best: string | null; waiting: number }, f: Frame) =>
  frame(f, {
    subject: n.why === "answered" ? `Everyone's answered for ${n.title}` : `Time to pick a date for ${n.title}`,
    lines: [
      n.why === "answered" ? `Everyone's said which dates work for ${n.title}.` : `You said you'd pick a date for ${n.title} today.`,
      n.why === "decide" && n.waiting > 0 && `${n.waiting} ${n.waiting === 1 ? "person hasn't" : "people haven't"} answered.`,
      n.best && `Best so far: ${n.best}.`,
    ],
    action: { label: "Set the date", url: f.url },
  });

/** Its date is set. `status` is what their answer to that date made them, if they gave one */
export const dateSet = (n: Night & { status: "going" | "maybe" | "declined" | null }, f: Frame) =>
  frame(f, {
    subject: `${n.title}: the date's set`,
    lines: [
      `${n.title} has its date.`,
      whenWhere(n, f),
      n.status === "going" && "You're down as going, from what you answered.",
      n.status === "maybe" && "You're down as a maybe, from what you answered.",
      n.status === "declined" && "You're down as can't make it, from what you answered.",
    ],
    action: { label: n.status ? "See the event" : "Say if you're coming", url: f.url },
  });

/** Its date fell through, and it's picking another */
export const dateFellThrough = (n: { title: string; was: Date | string }, f: Frame) =>
  frame(f, {
    subject: `${n.title}: that date fell through`,
    lines: [`${emailWhen(n.was, f.timeZone)} fell through for ${n.title}, so it's picking another date.`],
    action: { label: "Say which dates work", url: f.url },
  });

/** It moved, or is somewhere else. Null when nothing people would notice changed */
export function nightChanged(before: Night, after: Night & { by: string }, f: Frame): Email | null {
  const time = (n: Night) => new Date(n.startsAt).getTime();
  const changes = [
    time(before) !== time(after) && `Now ${emailWhen(after.startsAt, f.timeZone)}`,
    (before.location ?? "") !== (after.location ?? "") && (after.location ? `Now at ${after.location}` : "No place set now"),
  ].filter((l): l is string => Boolean(l));
  if (!changes.length) return null;
  return frame(f, { subject: `${after.title} changed`, lines: [`${after.by} changed ${after.title}.`, changes.join("\n")], action: { label: "See the event", url: f.url } });
}

/** Called off, or back on after being called off */
export const nightOff = (n: { title: string; by: string; on: boolean; startsAt?: Date | string | null }, f: Frame) =>
  frame(f, {
    subject: `${n.title} is ${n.on ? "back on" : "off"}`,
    lines: [`${n.by} ${n.on ? "reopened" : "called off"} ${n.title}${n.startsAt ? `, ${emailWhen(n.startsAt, f.timeZone)}` : ""}.`],
    action: n.on ? { label: "See the event", url: f.url } : undefined,
  });

export const seatOpened = (n: Night, f: Frame) =>
  frame(f, { subject: `You've got a seat: ${n.title}`, lines: [`A seat opened up, so you're going to ${n.title}.`, whenWhere(n, f)], action: { label: "See the event", url: f.url } });

/** A few hours before */
export const reminder = (n: Night & { status: "going" | "maybe"; bringing: string[] }, f: Frame) =>
  frame(f, {
    subject: `Coming up: ${n.title}`,
    lines: [
      `${n.title} is coming up.`,
      whenWhere(n, f),
      n.bringing.length > 0 && `Don't forget to bring ${n.bringing.join(", ")}.`,
      n.status === "maybe" && "You're a maybe: say if you're coming.",
    ],
    action: { label: "See the event", url: f.url },
  });

/** The morning after, to whoever made it, with nothing logged */
export const logNudge = (n: { title: string }, f: Frame) =>
  frame(f, { subject: `How did ${n.title} go?`, lines: [`Nothing's logged for ${n.title} yet. Tick the games you played, and add any that weren't on the list.`], action: { label: "Log what you played", url: f.url } });

/** After a casual night, the games someone hasn't rated */
export const rateNudge = (n: { title: string; games: string[] }, f: Frame) =>
  frame(f, {
    subject: `What did you think of ${n.games.length === 1 ? n.games[0] : "the games"}?`,
    lines: [`Thanks for coming to ${n.title}. You played ${n.games.join(", ")}.`, "A tap each, so the next one is planned with what you like in mind."],
    action: { label: "Rate what you played", url: f.url },
  });

export const bringAsk = (n: Night & { by: string; game: string }, f: Frame) =>
  frame(f, { subject: `Can you bring ${n.game}?`, lines: [`${n.by} asked if you'd bring ${n.game} to ${n.title}.`, whenWhere(n, f)], action: { label: "Answer", url: f.url } });

/** For a forgotten password */
export const passwordReset = (n: { name: string }, f: Pick<Frame, "siteName" | "url">) =>
  buildEmail({
    subject: `Choose a new password for ${f.siteName}`,
    lines: [`Hi ${n.name}. Someone, hopefully you, asked for a new password on ${f.siteName}. The link works once, for a day.`, "If it wasn't you, ignore this: your password stays as it is."],
    action: { label: "Choose a new password", url: f.url },
    siteName: f.siteName,
  });

export const confirmEmail = (n: { name: string }, f: Pick<Frame, "siteName" | "url">) =>
  buildEmail({
    subject: `Confirm your email for ${f.siteName}`,
    lines: [`Hi ${n.name}. Confirm this is your address to get emails about events, and to get back in if you forget your password.`, `If you don't know ${f.siteName}, ignore this.`],
    action: { label: "Confirm it", url: f.url },
    siteName: f.siteName,
  });
