import { describe, expect, it } from "vitest";
import { buildCalendarPanel, buildNewLinkCheck } from "./calendar-message";
import { actionId, parseActionId } from "./interactions";

const base = { nightId: 7, title: "Game night", addUrl: "https://boardroom.example/calendar/7-key", syncUrl: "https://boardroom.example/calendar/sync/token" };
type Row = { components: { label: string; url?: string; custom_id?: string }[] };
const buttons = (m: { components: unknown[] }) => (m.components[1] as Row).components;
const text = (m: { components: unknown[] }) => (m.components[0] as { content: string }).content;

describe("buildCalendarPanel", () => {
  it("offers adding the one event, syncing, and a new link", () => {
    const b = buttons(buildCalendarPanel(base));
    expect(b.map((x) => x.label)).toEqual(["Add this event", "Sync my events", "New sync link"]);
    expect(b[0].url).toBe(base.addUrl);
    expect(b[1].url).toBe(base.syncUrl);
    expect(parseActionId(b[2].custom_id)).toEqual({ kind: "calendarNew", nightId: 7 });
  });

  it("explains how to sync to someone who hasn't answered anything yet", () => {
    const m = buildCalendarPanel({ ...base, syncUrl: null });
    expect(buttons(m).map((x) => x.label)).toEqual(["Add this event"]);
    expect(text(m)).toContain("press Add to calendar again");
  });

  it("says when the link is a new one", () => {
    expect(text(buildCalendarPanel({ ...base, newLink: true }))).toContain("old one has stopped working");
  });
});

describe("buildNewLinkCheck", () => {
  it("asks before replacing the link", () => {
    expect(parseActionId(buttons(buildNewLinkCheck(7))[0].custom_id)).toEqual({ kind: "calendarNew", nightId: 7, sure: true });
  });
});

describe("the calendar buttons' ids", () => {
  it("round-trip", () => {
    expect(parseActionId(actionId({ kind: "calendar", nightId: 7 }))).toEqual({ kind: "calendar", nightId: 7 });
    expect(parseActionId(actionId({ kind: "calendarNew", nightId: 7 }))).toEqual({ kind: "calendarNew", nightId: 7 });
  });
});
