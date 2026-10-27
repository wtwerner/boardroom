import { describe, expect, it } from "vitest";
import { formatForForm, parseDate, parseDateList, parseTime, parseWhen } from "./when";

const TZ = "America/Chicago";
// Wednesday, Oct 21 2026, 8 pm in Chicago (already Thursday in UTC)
const now = new Date("2026-10-22T01:00:00Z");

describe("parseDate", () => {
  it("reads today and tomorrow in the group's time zone", () => {
    expect(parseDate("today", now, TZ)).toBe("2026-10-21");
    expect(parseDate("tonight", now, TZ)).toBe("2026-10-21");
    expect(parseDate("Tomorrow", now, TZ)).toBe("2026-10-22");
  });

  it("reads a weekday as the next one, today included", () => {
    expect(parseDate("thu", now, TZ)).toBe("2026-10-22");
    expect(parseDate("Thursday", now, TZ)).toBe("2026-10-22");
    expect(parseDate("thurs", now, TZ)).toBe("2026-10-22");
    expect(parseDate("sat", now, TZ)).toBe("2026-10-24");
    expect(parseDate("tue", now, TZ)).toBe("2026-10-27");
    expect(parseDate("wed", now, TZ)).toBe("2026-10-21");
    expect(parseDate("next wed", now, TZ)).toBe("2026-10-28");
    expect(parseDate("next thu", now, TZ)).toBe("2026-10-22");
  });

  it("reads month and day, rolling a date that's gone into next year", () => {
    expect(parseDate("10/29", now, TZ)).toBe("2026-10-29");
    expect(parseDate("Oct 29", now, TZ)).toBe("2026-10-29");
    expect(parseDate("october 29th", now, TZ)).toBe("2026-10-29");
    expect(parseDate("29 Oct", now, TZ)).toBe("2026-10-29");
    expect(parseDate("Thu Oct 29", now, TZ)).toBe("2026-10-29");
    expect(parseDate("Thu, Oct 29", now, TZ)).toBe("2026-10-29");
    expect(parseDate("1/8", now, TZ)).toBe("2027-01-08");
    expect(parseDate("oct 21", now, TZ)).toBe("2026-10-21");
    expect(parseDate("oct 20", now, TZ)).toBe("2027-10-20");
  });

  it("keeps a year that's given", () => {
    expect(parseDate("2026-10-29", now, TZ)).toBe("2026-10-29");
    expect(parseDate("10/29/27", now, TZ)).toBe("2027-10-29");
    expect(parseDate("Oct 29 2027", now, TZ)).toBe("2027-10-29");
    expect(parseDate("Oct 29, 2027", now, TZ)).toBe("2027-10-29");
  });

  it("refuses what isn't a date", () => {
    expect(parseDate("", now, TZ)).toBeNull();
    expect(parseDate("soon", now, TZ)).toBeNull();
    expect(parseDate("2/30", now, TZ)).toBeNull();
    expect(parseDate("13/1", now, TZ)).toBeNull();
    expect(parseDate("ma 3", now, TZ)).toBeNull();
    expect(parseDate("thunder", now, TZ)).toBeNull();
  });
});

describe("parseTime", () => {
  it("reads am and pm", () => {
    expect(parseTime("7pm")).toBe("19:00");
    expect(parseTime("7 PM")).toBe("19:00");
    expect(parseTime("7:30 p.m.")).toBe("19:30");
    expect(parseTime("7:00 pm")).toBe("19:00");
    expect(parseTime("10am")).toBe("10:00");
    expect(parseTime("12pm")).toBe("12:00");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("noon")).toBe("12:00");
  });

  it("reads a 24-hour time", () => {
    expect(parseTime("19:00")).toBe("19:00");
    expect(parseTime("1900")).toBe("19:00");
    expect(parseTime("09:30")).toBe("09:30");
    expect(parseTime("12:15")).toBe("12:15");
  });

  it("takes an hour without am or pm as the evening", () => {
    expect(parseTime("7")).toBe("19:00");
    expect(parseTime("7:30")).toBe("19:30");
  });

  it("refuses what isn't a time", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("evening")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("7:75")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
  });
});

describe("parseWhen", () => {
  it("gives the date, time and the moment it starts", () => {
    expect(parseWhen("thu", "7pm", now, TZ)).toEqual({ date: "2026-10-22", time: "19:00", startsAt: new Date("2026-10-23T00:00:00Z") });
  });

  it("follows daylight saving", () => {
    expect((parseWhen("Nov 5", "7pm", now, TZ) as { startsAt: Date }).startsAt.toISOString()).toBe("2026-11-06T01:00:00.000Z");
  });

  it("says which part it couldn't read", () => {
    expect(parseWhen("soon", "7pm", now, TZ)).toEqual({ error: expect.stringContaining('"soon"') });
    expect(parseWhen("thu", "late", now, TZ)).toEqual({ error: expect.stringContaining('"late"') });
  });
});

describe("formatForForm", () => {
  it("shows a night the way the form reads it back", () => {
    const shown = formatForForm(new Date("2026-10-30T00:00:00Z"), TZ);
    expect(shown).toEqual({ date: "Thu Oct 29", time: "7:00 pm" });
    expect(parseWhen(shown.date, shown.time, now, TZ)).toMatchObject({ date: "2026-10-29", time: "19:00" });
  });
});

describe("parseDateList", () => {
  const list = (text: string, max = 8) => {
    const r = parseDateList(text, "19:00", now, TZ, max);
    return "error" in r ? r : r.map((w) => `${w.date} ${w.time}`);
  };

  it("reads dates separated by commas, each at the default time, soonest first", () => {
    expect(list("sat, thu, 10/29")).toEqual(["2026-10-22 19:00", "2026-10-24 19:00", "2026-10-29 19:00"]);
  });

  it("reads one date per line, keeping a weekday and its date together", () => {
    expect(list("Thu, Oct 29\nSat Oct 31")).toEqual(["2026-10-29 19:00", "2026-10-31 19:00"]);
  });

  it("lets each date have its own time", () => {
    expect(list("sat 2pm, 11/7 at 6, fri 19:30, sun noon")).toEqual(["2026-10-23 19:30", "2026-10-24 14:00", "2026-10-25 12:00", "2026-11-07 18:00"]);
  });

  it("doesn't read a day of the month as a time", () => {
    expect(list("Oct 29, Nov 7")).toEqual(["2026-10-29 19:00", "2026-11-07 19:00"]);
  });

  it("keeps a year after a comma with its date", () => {
    expect(list("Jan 8, 2027, Jan 9")).toEqual(["2027-01-08 19:00", "2027-01-09 19:00"]);
  });

  it("drops a date given twice", () => {
    expect(list("thu, 10/22, Thursday")).toEqual(["2026-10-22 19:00"]);
  });

  it("says which date couldn't be read or has gone by", () => {
    expect(list("thu, someday")).toEqual({ error: 'Couldn\'t read "someday" as a date. Try thu, 10/29 or Oct 29.' });
    // 8 pm Wednesday: 7 pm tonight is over
    expect(list("today")).toEqual({ error: '"today" has already gone by. Pick dates that are coming up.' });
    expect(list("")).toEqual({ error: "Give a date or two to pick from." });
  });

  it("holds as many dates as a poll fits", () => {
    expect(list("thu, fri, sat", 2)).toEqual({ error: "That's 3 dates; a poll fits 2." });
  });
});
