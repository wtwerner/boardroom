import { describe, expect, it } from "vitest";
import { type Addressing, type Draft, buildEmail, dateSet, emailSoon, emailWhen, madeMember, nightChanged, nightMade, nightOff, passwordReset, reminder } from "./email-message";

const tz = "America/Chicago";
const f = { timeZone: tz, url: "https://example.com/events/4", calendar: { url: "https://example.com/calendar/4-key", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" } };
const night = { title: "10/29/26 Game Night", startsAt: "2026-10-30T00:00:00Z", location: "Sam's" };
const to: Addressing = { siteName: "Boardroom", stop: { page: "https://example.com/email/stop/k", oneClick: "https://example.com/api/email/stop/k", settings: "https://example.com/settings#email" } };
const send = (d: Draft | null, addressed = to) => buildEmail(d!, addressed);
// Times print with a narrow space before AM and PM
const plain = (s: string) => s.replace(/ /g, " ");

describe("buildEmail", () => {
  it("says everything as text and as HTML, with the event, the button and where to stop it", () => {
    const e = send(nightMade({ ...night, by: "Sam" }, f));
    for (const body of [e.text, e.html]) {
      expect(body).toContain("Sam added an event.");
      expect(body).toContain("10/29/26 Game Night");
      expect(plain(body)).toContain("Thursday, October 29 at 7:00 PM CDT");
      expect(body).toContain(f.url);
      expect(body).toContain(to.stop!.page);
    }
    expect(e.subject).toBe("New event: 10/29/26 Game Night");
  });

  it("lets mail apps unsubscribe in one click, and attaches the event for calendars", () => {
    const e = send(nightMade({ ...night, by: "Sam" }, f));
    expect(e.headers).toEqual({ "List-Unsubscribe": `<${to.stop!.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(e.attachments).toEqual([expect.objectContaining({ filename: "event.ics", content: f.calendar.ics })]);
    expect(e.text).toContain(`Add it to your calendar: ${f.calendar.url}`);
  });

  it("attaches nothing for an event without a date", () => {
    const e = send(nightMade({ ...night, by: "Sam" }, { ...f, calendar: null }));
    expect(e.attachments).toBeUndefined();
    expect(e.text).not.toContain("calendar");
  });

  it("escapes what people typed, and keeps the subject to a line", () => {
    const e = buildEmail({ subject: "Hi\r\nBcc: everyone@example.com", intro: "<script>alert(1)</script> & co", card: { title: '<img src=x onerror="1">', rows: [] } }, { siteName: "<b>Site</b>" });
    expect(e.subject).toBe("Hi Bcc: everyone@example.com");
    expect(e.html).not.toMatch(/<script>|<b>|<img/);
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.text).toContain("<script>");
  });

  it("doesn't offer to stop account emails", () => {
    const e = buildEmail(passwordReset({ name: "Sam", siteName: "Boardroom" }, { url: "https://example.com/password/t" }), { siteName: "Boardroom" });
    expect(e.text).not.toContain("Stop emails");
    expect(e.headers).toBeUndefined();
  });
});

describe("emailWhen and emailSoon", () => {
  it("are in the group's time zone, and say which", () => {
    expect(plain(emailWhen("2026-10-30T00:00:00Z", tz))).toBe("Thursday, October 29 at 7:00 PM CDT");
  });

  it("say tonight, today or tomorrow when it's that close", () => {
    const at = "2026-10-30T00:00:00Z"; // 7 PM on the 29th in Chicago
    expect(plain(emailSoon(at, tz, new Date("2026-10-29T20:00:00Z")))).toBe("tonight at 7:00 PM CDT");
    expect(plain(emailSoon("2026-10-29T18:00:00Z", tz, new Date("2026-10-29T14:00:00Z")))).toBe("today at 1:00 PM CDT");
    expect(plain(emailSoon(at, tz, new Date("2026-10-28T20:00:00Z")))).toBe("tomorrow at 7:00 PM CDT");
    expect(plain(emailSoon(at, tz, new Date("2026-10-20T20:00:00Z")))).toBe("Thursday, October 29 at 7:00 PM CDT");
    // Late in the evening it's already tomorrow in UTC, but not in Chicago
    expect(plain(emailSoon(at, tz, new Date("2026-10-30T03:00:00Z")))).toBe("tonight at 7:00 PM CDT");
  });
});

describe("nightChanged", () => {
  it("says what moved, and what it was", () => {
    const placed = send(nightChanged(night, { ...night, location: "Alex's", by: "Sam" }, f)).text;
    expect(placed).toContain("Sam changed where it is.");
    expect(placed).toContain("Now at: Alex's");
    expect(placed).toContain("It was at Sam's.");
    const moved = send(nightChanged(night, { ...night, startsAt: "2026-10-31T00:00:00Z", by: "Sam" }, f)).text;
    expect(moved).toContain("Now: Friday, October 30");
    expect(moved).toContain("It was Thursday, October 29");
    expect(send(nightChanged(night, { ...night, location: null, by: "Sam" }, f)).text).toContain("Now at: No place set yet");
  });

  it("stays quiet about a new name", () => {
    expect(nightChanged(night, { ...night, title: "Dune night", by: "Sam" }, f)).toBeNull();
  });
});

describe("what someone's down as", () => {
  it("is on the date being set, with the calendar unless they can't come", () => {
    expect(send(dateSet({ ...night, status: "maybe" }, f)).text).toContain("You're down as a maybe.");
    expect(send(dateSet({ ...night, status: null }, f)).text).toContain("Say if you're coming");
    expect(send(dateSet({ ...night, status: "declined" }, f)).attachments).toBeUndefined();
    expect(send(dateSet({ ...night, status: "going" }, f)).subject).toBe("10/29/26 Game Night is on Thursday, October 29");
  });

  it("is on the reminder, with what they're bringing and how soon", () => {
    const e = send(reminder({ ...night, status: "going", bringing: ["Azul", "Skull"] }, f, new Date("2026-10-29T20:00:00Z")));
    expect(plain(e.subject)).toBe("Tonight at 7:00 PM CDT: 10/29/26 Game Night");
    expect(e.text).toContain("Don't forget to bring Azul, Skull.");
    expect(e.text).toContain("You're down as going.");
    expect(send(reminder({ ...night, status: "maybe", bringing: [] }, f)).text).toContain("Say if you're coming");
  });
});

describe("other messages", () => {
  it("say when an event's off, with no button", () => {
    const e = send(nightOff({ title: "Game Night", by: "Sam", on: false, startsAt: night.startsAt }, f));
    expect(e.subject).toBe("Called off: Game Night");
    expect(e.text).toContain("It was set for Thursday, October 29");
    expect(e.text).not.toContain("See the event");
  });

  it("name the group's own nights for someone made a member, when there are two kinds", () => {
    expect(madeMember({ by: "Sam", night: "strategy night" }, { url: "https://example.com/welcome" }).subject).toBe("You're in for strategy night");
    expect(madeMember({ by: "Sam", night: null }, { url: "https://example.com/welcome" }).subject).toBe("You're a member now");
  });
});
