import { describe, expect, it } from "vitest";
import { parseActionId } from "./interactions";
import { bringAnswered, bringAskDm } from "./bring-message";

const ask = {
  planId: 41,
  game: "Azul",
  night: { title: "Casual night", startsAt: "2026-10-30T00:00:00.000Z" },
  by: "Alex",
  url: "https://boardroom.example/events/30",
};

type Row = { components: { label: string; custom_id: string }[] };

describe("bringAskDm", () => {
  it("says who asked, for what and when, with a link to the event", () => {
    expect(bringAskDm(ask).content).toBe(
      "**Alex** asked if you'd bring **Azul** to **Casual night**, <t:1793318400:F>.\n-# [The event](<https://boardroom.example/events/30>)",
    );
  });

  it("leaves the link off when the site's address isn't known", () => {
    expect(bringAskDm({ ...ask, url: null }).content).not.toContain("The event");
  });

  it("answers yes or no for that plan", () => {
    const [row] = bringAskDm(ask).components as Row[];
    expect(row.components.map((b) => [b.label, parseActionId(b.custom_id)])).toEqual([
      ["I'll bring it", { kind: "bring", planId: 41, yes: true }],
      ["Can't this time", { kind: "bring", planId: 41, yes: false }],
    ]);
  });

  it("escapes names Discord would read as formatting", () => {
    expect(bringAskDm({ ...ask, game: "Ticket_to_Ride" }).content).toContain("**Ticket\\_to\\_Ride**");
  });
});

describe("bringAnswered", () => {
  it("thanks a yes and confirms a no", () => {
    expect(bringAnswered({ yes: true, game: "Azul", night: "Casual night" })).toBe("You're bringing **Azul** to **Casual night**. Thanks!");
    expect(bringAnswered({ yes: false, game: "Azul", night: "Casual night" })).toBe("No problem. **Azul** is off the list for **Casual night**.");
  });
});
