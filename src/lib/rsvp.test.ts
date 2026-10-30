import { describe, expect, it } from "vitest";
import { MAX_GUESTS, fillSeats, groupAnswers, headcount, nextAnswer } from "./rsvp";

describe("nextAnswer", () => {
  it("starts with no guests", () => {
    expect(nextAnswer(null, "going")).toEqual({ status: "going", guests: 0 });
  });

  it("keeps guests when switching between going and maybe", () => {
    expect(nextAnswer({ status: "going", guests: 2 }, "maybe")).toEqual({ status: "maybe", guests: 2 });
  });

  it("drops guests for someone who can't make it", () => {
    expect(nextAnswer({ status: "going", guests: 2 }, "declined")).toEqual({ status: "declined", guests: 0 });
    expect(nextAnswer(null, "declined", 3)).toEqual({ status: "declined", guests: 0 });
  });

  it("keeps the guest count sensible", () => {
    expect(nextAnswer(null, "going", -1).guests).toBe(0);
    expect(nextAnswer(null, "going", 99).guests).toBe(MAX_GUESTS);
    expect(nextAnswer(null, "going", 1.7).guests).toBe(1);
    expect(nextAnswer(null, "going", Number.NaN).guests).toBe(0);
  });
});

describe("groupAnswers", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 9, 20, 12, m));

  it("lists each status in the order people answered", () => {
    const g = groupAnswers([
      { playerId: 2, status: "going", guests: 0, respondedAt: at(5) },
      { playerId: 1, status: "going", guests: 1, respondedAt: at(1) },
      { playerId: 3, status: "maybe", guests: 0, respondedAt: at(2) },
      { playerId: 4, status: "declined", guests: 0, respondedAt: at(3) },
    ]);
    expect(g.going.map((r) => r.playerId)).toEqual([1, 2]);
    expect(g.maybe.map((r) => r.playerId)).toEqual([3]);
    expect(g.declined.map((r) => r.playerId)).toEqual([4]);
    expect(g.waitlist).toEqual([]);
  });
});

describe("headcount", () => {
  it("counts each person, their guests, and others counted by hand", () => {
    expect(headcount([{ guests: 2 }, {}, { guests: 0 }], 1)).toBe(6);
    expect(headcount([], 0)).toBe(0);
  });
});

describe("fillSeats", () => {
  const sam = { name: "Sam", guests: 0 };
  const alex = { name: "Alex", guests: 2 };
  const jordan = { name: "Jordan", guests: 0 };
  const casey = { name: "Casey", guests: 0 };

  it("seats everyone without a limit", () => {
    expect(fillSeats([sam, alex, jordan], null, 4)).toEqual({ going: [sam, alex, jordan], waitlist: [] });
  });

  it("seats people in the order they answered, with their guests", () => {
    expect(fillSeats([sam, alex, jordan, casey], 4, 0)).toEqual({ going: [sam, alex], waitlist: [jordan, casey] });
  });

  it("keeps the line in order when someone after would still fit", () => {
    // Alex and two guests don't fit in the two seats left, so Jordan waits behind them
    expect(fillSeats([sam, alex, jordan], 3, 0)).toEqual({ going: [sam], waitlist: [alex, jordan] });
  });

  it("counts the others counted by hand first", () => {
    expect(fillSeats([sam, jordan], 3, 2)).toEqual({ going: [sam], waitlist: [jordan] });
  });

  it("seats the next in line when a seat opens", () => {
    expect(fillSeats([sam, jordan, casey], 2, 0).going).toEqual([sam, jordan]);
    expect(fillSeats([sam, casey], 2, 0).going).toEqual([sam, casey]);
  });
});
