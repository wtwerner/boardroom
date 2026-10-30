import { describe, expect, it } from "vitest";
import { answerFor, answeredBy, dateVerdicts, rankDates, resolveAnswers, rsvpFor, toggleWorks, waitingOn } from "./date-answers";

const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h)).toISOString();
const thu = { id: 1, createdAt: at(0), fellThrough: false };
const sat = { id: 2, createdAt: at(0), fellThrough: false };

describe("resolveAnswers", () => {
  it("counts a date someone left alone as can't, once they've answered another", () => {
    const [onThu, onSat] = resolveAnswers([thu, sat], [{ optionId: 1, playerId: 7, answer: "yes", at: at(2) }]);
    expect(onThu.answers).toEqual([{ playerId: 7, answer: "yes", at: at(2), assumed: false }]);
    expect(onSat.answers).toEqual([{ playerId: 7, answer: "no", at: at(2), assumed: true }]);
  });

  it("leaves someone waiting on a date added after their last answer", () => {
    const sun = { id: 3, createdAt: at(5), fellThrough: false };
    const [, , onSun] = resolveAnswers([thu, sat, sun], [{ optionId: 1, playerId: 7, answer: "yes", at: at(2) }]);
    expect(onSun.answers).toEqual([]);
  });

  it("counts a date added before a later answer as seen", () => {
    const sun = { id: 3, createdAt: at(3), fellThrough: false };
    const [, , onSun] = resolveAnswers(
      [thu, sat, sun],
      [
        { optionId: 1, playerId: 7, answer: "yes", at: at(2) },
        { optionId: 2, playerId: 7, answer: "maybe", at: at(4) },
      ],
    );
    expect(onSun.answers).toEqual([{ playerId: 7, answer: "no", at: at(4), assumed: true }]);
  });

  it("doesn't count answers to a date that fell through toward the others", () => {
    const gone = { id: 9, createdAt: at(0), fellThrough: true };
    const result = resolveAnswers([gone, sat], [{ optionId: 9, playerId: 7, answer: "yes", at: at(6) }]);
    expect(result[0].answers).toHaveLength(1);
    expect(result[1].answers).toEqual([]);
    expect(answeredBy([gone, sat], [{ optionId: 9, playerId: 7, answer: "yes", at: at(6) }]).size).toBe(0);
  });

  it("lists answers in the order they were given", () => {
    const [onThu] = resolveAnswers(
      [thu],
      [
        { optionId: 1, playerId: 8, answer: "yes", at: at(4) },
        { optionId: 1, playerId: 7, answer: "maybe", at: at(2) },
      ],
    );
    expect(onThu.answers.map((a) => a.playerId)).toEqual([7, 8]);
  });
});

describe("answers and a night's answers", () => {
  it("turn into each other", () => {
    expect([rsvpFor("yes"), rsvpFor("maybe"), rsvpFor("no")]).toEqual(["going", "maybe", "declined"]);
    expect([answerFor("going"), answerFor("waitlist"), answerFor("maybe"), answerFor("declined")]).toEqual(["yes", "yes", "maybe", "no"]);
  });

  it("Works for me turns it on, or off to can't", () => {
    expect([toggleWorks(null), toggleWorks("no"), toggleWorks("maybe"), toggleWorks("yes")]).toEqual(["yes", "yes", "yes", "no"]);
  });
});

describe("rankDates", () => {
  const d = (id: number, startsAt: string, yes: number, maybe = 0, more: { past?: boolean; fellThrough?: boolean } = {}) => ({
    id,
    startsAt,
    past: more.past ?? false,
    fellThrough: more.fellThrough,
    yes: Array(yes).fill(0),
    maybe: Array(maybe).fill(0),
  });

  it("puts the most who can come first, then the fewest maybes, then the soonest", () => {
    const dates = [d(1, at(1), 2), d(2, at(2), 2, 1), d(3, at(3), 3), d(4, at(4), 1, 2), d(5, at(5), 3)];
    expect(rankDates(dates).map((x) => x.id)).toEqual([3, 5, 2, 4, 1]);
  });

  it("leaves out dates gone by or fallen through", () => {
    expect(rankDates([d(1, at(1), 5, 0, { past: true }), d(2, at(2), 5, 0, { fellThrough: true }), d(3, at(3), 0)]).map((x) => x.id)).toEqual([3]);
  });
});

describe("dateVerdicts", () => {
  const p = (...ids: number[]) => ids.map((playerId) => ({ playerId }));
  const date = (id: number, h: number, yes: number[], maybe: number[] = [], more: { past?: boolean } = {}) => ({ id, startsAt: at(h), past: more.past ?? false, yes: p(...yes), maybe: p(...maybe) });

  it("says everyone when every member can come, if only if they have to", () => {
    const v = dateVerdicts([date(1, 1, [1, 2], [3]), date(2, 2, [1])], [1, 2, 3], 2);
    expect(v.get(1)).toBe("everyone");
    expect(v.get(2)).toBe("few");
  });

  it("marks the best date that has enough, once", () => {
    const v = dateVerdicts([date(1, 1, [1, 2]), date(2, 2, [1, 2, 3]), date(3, 3, [2, 3, 9])], [1, 2, 3, 4], 2);
    expect([...v]).toEqual([[2, "best"]]);
  });

  it("counts people who aren't members toward the fewest, and leaves dates nobody can come to alone", () => {
    const v = dateVerdicts([date(1, 1, [1, 9, 8]), date(2, 2, [])], [1, 2], 3);
    expect(v.get(1)).toBe("best");
    expect(v.has(2)).toBe(false);
  });

  it("gives no best when no date has enough", () => {
    const v = dateVerdicts([date(1, 1, [1]), date(2, 2, [2], [], { past: true })], [1, 2], 2);
    expect([...v]).toEqual([[1, "few"]]);
  });
});

describe("waitingOn", () => {
  it("is the members who haven't answered, and members with no player yet", () => {
    const members = [{ playerId: 1 }, { playerId: null }, { playerId: 3 }];
    expect(waitingOn(members, new Set([1]))).toEqual([{ playerId: null }, { playerId: 3 }]);
  });
});
