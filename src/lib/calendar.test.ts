import { describe, expect, it } from "vitest";
import { type CalendarEvent, buildCalendar, deviceFrom, googleCalendarUrl, googleSubscribeUrl, outlookCalendarUrl, readNightKey, signNightKey, webcalUrl } from "./calendar";

const night: CalendarEvent = {
  id: 7,
  title: "10/29 Game Night",
  startsAt: new Date("2026-10-29T23:00:00.000Z"),
  endsAt: new Date("2026-10-30T02:00:00.000Z"),
  location: "Sam's, upstairs",
  url: "https://boardroom.example/events/7",
  cancelled: false,
  updatedAt: new Date("2026-10-20T12:00:00.000Z"),
};

/** Lines as a reader sees them, with folded ones put back together */
const unfolded = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("buildCalendar", () => {
  it("writes a night in UTC with an id that stays the same", () => {
    const lines = unfolded(buildCalendar([night], { host: "boardroom.example" }));
    expect(lines).toContain("UID:night-7@boardroom.example");
    expect(lines).toContain("DTSTART:20261029T230000Z");
    expect(lines).toContain("DTEND:20261030T020000Z");
    expect(lines).toContain("DTSTAMP:20261020T120000Z");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("escapes what iCalendar treats as punctuation", () => {
    const ics = buildCalendar([{ ...night, title: "Catan; then, maybe\nmore \\ games" }], { host: "h" });
    expect(unfolded(ics)).toContain("SUMMARY:Catan\\; then\\, maybe\\nmore \\\\ games");
    expect(unfolded(ics)).toContain("LOCATION:Sam's\\, upstairs");
  });

  it("marks a cancelled night, so a subscribed calendar shows it", () => {
    expect(unfolded(buildCalendar([{ ...night, cancelled: true }], { host: "h" }))).toContain("STATUS:CANCELLED");
  });

  it("leaves out what a night doesn't have", () => {
    const ics = buildCalendar([{ ...night, location: null, url: null }], { host: "h" });
    expect(ics).not.toMatch(/LOCATION|DESCRIPTION|URL:/);
  });

  it("uses line breaks calendars accept, and folds long lines without splitting a character", () => {
    const title = "🎲".repeat(60);
    const ics = buildCalendar([{ ...night, title }], { host: "h" });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfolded(ics)).toContain(`SUMMARY:${title}`);
  });

  it("names a feed and asks for it to be checked hourly, which a single event doesn't", () => {
    const feed = buildCalendar([night], { host: "h", feedName: "Boardroom" });
    expect(feed).toContain("X-WR-CALNAME:Boardroom");
    expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(buildCalendar([night], { host: "h" })).not.toContain("X-WR-CALNAME");
  });

  it("makes a feed with nothing in it yet", () => {
    const lines = unfolded(buildCalendar([], { host: "h", feedName: "Boardroom" }));
    expect(lines).toContain("BEGIN:VCALENDAR");
    expect(lines).not.toContain("BEGIN:VEVENT");
  });
});

describe("links to add it", () => {
  it("fills in Google's screen", () => {
    const url = new URL(googleCalendarUrl(night));
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("10/29 Game Night");
    expect(url.searchParams.get("dates")).toBe("20261029T230000Z/20261030T020000Z");
    expect(url.searchParams.get("location")).toBe("Sam's, upstairs");
    expect(url.searchParams.get("details")).toContain("https://boardroom.example/events/7");
  });

  it("fills in Outlook's screen", () => {
    const url = new URL(outlookCalendarUrl(night));
    expect(url.searchParams.get("subject")).toBe("10/29 Game Night");
    expect(url.searchParams.get("startdt")).toBe("2026-10-29T23:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-10-30T02:00:00.000Z");
  });
});

describe("subscribing", () => {
  const feed = "https://boardroom.example/api/calendar/feed/abc.ics";

  it("points calendar apps at the feed", () => {
    expect(webcalUrl(feed)).toBe("webcal://boardroom.example/api/calendar/feed/abc.ics");
    expect(new URL(googleSubscribeUrl(feed)).searchParams.get("cid")).toBe("webcal://boardroom.example/api/calendar/feed/abc.ics");
  });
});

describe("a night's key", () => {
  it("reads back the night it was signed for", () => {
    expect(readNightKey(signNightKey(12, "secret"), "secret")).toBe(12);
  });

  it("refuses another night's id, another secret and anything malformed", () => {
    const signature = signNightKey(12, "secret").split("-").slice(1).join("-");
    expect(readNightKey(`13-${signature}`, "secret")).toBeNull();
    expect(readNightKey(signNightKey(12, "other"), "secret")).toBeNull();
    for (const key of ["12", "12-short", "", "sync", "-1-aaaaaaaaaaaaaaaaaaaaaa"]) expect(readNightKey(key, "secret")).toBeNull();
  });
});

describe("deviceFrom", () => {
  it("tells phones apart", () => {
    expect(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("apple");
    expect(deviceFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("apple");
    expect(deviceFrom("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(deviceFrom("Mozilla/5.0 (Windows NT 10.0)")).toBe("other");
    expect(deviceFrom(null)).toBe("other");
  });
});
