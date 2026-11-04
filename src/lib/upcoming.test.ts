import { describe, expect, it } from "vitest";
import { NEWEST_IN_FAMILY, collectUpcoming, isStillPrelaunch, parseLaunchDate, parsePrelaunchBody, upcomingStatus } from "./upcoming";

const today = "2026-11-04";

describe("parseLaunchDate", () => {
  it("reads a month and year however it's written", () => {
    expect(parseLaunchDate("January 2027")).toEqual({ label: "January 2027", until: "2027-01" });
    expect(parseLaunchDate("Jan 2027")).toEqual({ label: "January 2027", until: "2027-01" });
    expect(parseLaunchDate("March 12, 2027")).toEqual({ label: "March 2027", until: "2027-03" });
    expect(parseLaunchDate("12 Sept 2027")).toEqual({ label: "September 2027", until: "2027-09" });
    expect(parseLaunchDate("Feb. 3rd 2027")).toEqual({ label: "February 2027", until: "2027-02" });
    expect(parseLaunchDate("5th of March, 2027")).toEqual({ label: "March 2027", until: "2027-03" });
    expect(parseLaunchDate("March / April 2027")).toEqual({ label: "April 2027", until: "2027-04" });
  });

  it("takes the last month a quarter or a year could mean", () => {
    expect(parseLaunchDate("Q2 2027")).toEqual({ label: "Q2 2027", until: "2027-06" });
    expect(parseLaunchDate("Q4, 2026")).toEqual({ label: "Q4 2026", until: "2026-12" });
    expect(parseLaunchDate("Q4,2026")).toEqual({ label: "Q4 2026", until: "2026-12" });
    expect(parseLaunchDate("2026 or 2027")).toEqual({ label: "2026 or 2027", until: "2027-12" });
    expect(parseLaunchDate("Early 2027")).toEqual({ label: "Early 2027", until: "2027-12" });
    expect(parseLaunchDate("2027")).toEqual({ label: "2027", until: "2027-12" });
  });

  it("gives up on anything without a year", () => {
    expect(parseLaunchDate("TBD")).toBeNull();
    expect(parseLaunchDate("TBA")).toBeNull();
    expect(parseLaunchDate("https://www.kickstarter.com/")).toBeNull();
    expect(parseLaunchDate("January")).toBeNull();
    expect(parseLaunchDate("")).toBeNull();
    expect(parseLaunchDate("A long sentence that happens to mention 2027 somewhere in it")).toBeNull();
  });
});

describe("parsePrelaunchBody", () => {
  it("reads the platform and date from the field", () => {
    expect(parsePrelaunchBody("[b]Kickstarter Date[/b] January 2027\n[b]Designer[/b] Sam")).toEqual({ platform: "Kickstarter", launch: "January 2027", launchUntil: "2027-01" });
    expect(parsePrelaunchBody("[b]Gamefound date:[/b] Q1 2027")).toEqual({ platform: "Gamefound", launch: "Q1 2027", launchUntil: "2027-03" });
  });

  it("reads an entry without the bold", () => {
    expect(parsePrelaunchBody("Kickstarter Date: early 2027\nDesigner: Sam")).toEqual({ platform: "Kickstarter", launch: "early 2027", launchUntil: "2027-12" });
    expect(parsePrelaunchBody("Kickstarter Date October 20, 2026\nDesigner Sam")).toEqual({ platform: "Kickstarter", launch: "October 2026", launchUntil: "2026-10" });
  });

  it("reads the spellings people use", () => {
    expect(parsePrelaunchBody("[b]Kickstarter Relaunch Date[/b] May 2027").platform).toBe("Kickstarter");
    expect(parsePrelaunchBody("[b]Kickstarting Date[/b] TBA").platform).toBe("Kickstarter");
    expect(parsePrelaunchBody("Gemfound Date: Q4, 2026\n[url=https://gamefound.example]Page[/url]")).toEqual({ platform: "Gamefound", launch: "Q4 2026", launchUntil: "2026-12" });
    expect(parsePrelaunchBody("[b]BackerKit Date[/b] TBA").platform).toBe("BackerKit");
    expect(parsePrelaunchBody("[b]Crowdfunding Date[/b] May 2027")).toEqual({ platform: null, launch: "May 2027", launchUntil: "2027-05" });
  });

  it("keeps the platform when there's no date to read", () => {
    expect(parsePrelaunchBody("[b]Kickstarter Date[/b] TBD")).toEqual({ platform: "Kickstarter", launch: null, launchUntil: null });
    expect(parsePrelaunchBody("[b]Gamefound Date[/b] TBA\n[b]Designer[/b] Sam")).toEqual({ platform: "Gamefound", launch: null, launchUntil: null });
  });

  it("copes with an entry that doesn't follow the format", () => {
    expect(parsePrelaunchBody("Coming to crowdfunding at some point!")).toEqual({ platform: null, launch: null, launchUntil: null });
    expect(parsePrelaunchBody("")).toEqual({ platform: null, launch: null, launchUntil: null });
  });

  it("doesn't take another field's text for the date", () => {
    expect(parsePrelaunchBody("[b]Designer[/b] Sam 2027\n[b]Players[/b] 2-4").launch).toBeNull();
    expect(parsePrelaunchBody("[b]Designer[/b] Sam\n[b]Description[/b] ".concat("x".repeat(300), "\nUpdate date: May 2027")).launch).toBeNull();
  });
});

describe("isStillPrelaunch", () => {
  const touchedAt = new Date("2026-10-01T00:00:00Z");

  it("goes by the date when there is one, through its last month", () => {
    expect(isStillPrelaunch({ launchUntil: "2026-11", touchedAt }, today)).toBe(true);
    expect(isStillPrelaunch({ launchUntil: "2026-10", touchedAt }, today)).toBe(false);
  });

  it("gives an entry with no date a year since anyone touched it", () => {
    expect(isStillPrelaunch({ launchUntil: null, touchedAt }, today)).toBe(true);
    expect(isStillPrelaunch({ launchUntil: null, touchedAt: new Date("2025-10-01T00:00:00Z") }, today)).toBe(false);
  });
});

describe("collectUpcoming", () => {
  const entry = (id: number, over = {}) => ({ id, platform: null, launch: null, launchUntil: null, touchedAt: new Date("2026-10-01T00:00:00Z"), ...over });

  it("puts campaigns yet to open first, then newest first", () => {
    const got = collectUpcoming([{ platform: "Kickstarter", ids: [100, 300, 200] }], [entry(50, { launch: "January 2027", launchUntil: "2027-01" })], today);
    expect([...got.keys()]).toEqual([50, 300, 200, 100]);
    expect(got.get(50)).toMatchObject({ prelaunch: true, launch: "January 2027" });
    expect(got.get(300)).toEqual({ platform: "Kickstarter", prelaunch: false, launch: null, launchUntil: null });
  });

  it("only reads the newest of each family", () => {
    const ids = Array.from({ length: NEWEST_IN_FAMILY + 5 }, (_, i) => i + 1);
    const got = collectUpcoming([{ platform: "Kickstarter", ids }], [], today);
    expect(got.size).toBe(NEWEST_IN_FAMILY);
    expect(got.has(1)).toBe(false);
    expect(got.has(NEWEST_IN_FAMILY + 5)).toBe(true);
  });

  it("leaves out an entry whose date has gone by, unless a family has it", () => {
    const over = { launchUntil: "2026-01" };
    const got = collectUpcoming([{ platform: "Gamefound", ids: [20] }], [entry(10, over), entry(20, over)], today);
    expect(got.has(10)).toBe(false);
    expect(got.get(20)).toMatchObject({ platform: "Gamefound", prelaunch: false });
  });

  it("uses a family's platform when the list doesn't say", () => {
    const got = collectUpcoming([{ platform: "Gamefound", ids: [20] }], [entry(20)], today);
    expect(got.get(20)).toMatchObject({ platform: "Gamefound", prelaunch: true });
  });
});

describe("upcomingStatus", () => {
  const none = { year: null, source: null, trending: false, wishlisted: false };
  const family = { platform: "Kickstarter", prelaunch: false, launch: null, launchUntil: null };
  const list = { platform: "Gamefound", prelaunch: true, launch: "January 2027", launchUntil: "2027-01" };

  it("says when a campaign's opening, whatever the game's year", () => {
    expect(upcomingStatus({ ...none, year: 2024, source: list }, today)).toEqual({ kind: "opening", line: "Opening on Gamefound, January 2027" });
    expect(upcomingStatus({ ...none, source: { ...list, launch: null, launchUntil: null } }, today)?.line).toBe("Opening on Gamefound");
    expect(upcomingStatus({ ...none, source: { ...list, platform: null } }, today)?.line).toBe("Campaign coming, January 2027");
  });

  it("stops saying a campaign's opening once its month has gone by", () => {
    expect(upcomingStatus({ ...none, year: 2027, source: { ...list, launchUntil: "2026-10" } }, today)?.kind).toBe("crowdfunded");
    expect(upcomingStatus({ ...none, year: 2024, source: { ...list, launchUntil: "2026-10" } }, today)).toBeNull();
  });

  it("lists a recent crowdfunded game dated this year or later", () => {
    expect(upcomingStatus({ ...none, year: 2027, source: family }, today)).toEqual({ kind: "crowdfunded", line: "Crowdfunded on Kickstarter, due in 2027" });
    expect(upcomingStatus({ ...none, year: 2026, source: family }, today)?.line).toBe("Crowdfunded on Kickstarter, new in 2026");
    expect(upcomingStatus({ ...none, source: family }, today)?.line).toBe("Crowdfunded on Kickstarter, no release year yet");
    expect(upcomingStatus({ ...none, year: 2025, source: family }, today)).toBeNull();
  });

  it("lists trending and wishlisted games dated this year or later", () => {
    expect(upcomingStatus({ ...none, year: 2027, trending: true }, today)).toEqual({ kind: "new", line: "Due in 2027" });
    expect(upcomingStatus({ ...none, year: 2026, wishlisted: true }, today)).toEqual({ kind: "new", line: "New in 2026" });
    expect(upcomingStatus({ ...none, year: 2025, trending: true, wishlisted: true }, today)).toBeNull();
  });

  it("takes no year to mean something new only on the trending list", () => {
    expect(upcomingStatus({ ...none, trending: true }, today)?.line).toBe("No release year yet");
    expect(upcomingStatus({ ...none, wishlisted: true }, today)).toBeNull();
  });

  it("leaves out everything else", () => {
    expect(upcomingStatus({ ...none, year: 2027 }, today)).toBeNull();
  });
});
