import { describe, expect, it } from "vitest";
import { formatBggRating, ratingBaseline, suggestSentiment, suggestSentiments } from "./bgg-ratings";

describe("suggestSentiment", () => {
  it("reads a rating against the person's own average", () => {
    // Around 7: 8.5 and up is a love, 6.5 a like, 5 a meh, below that a no
    expect([9, 8.5, 8, 6.5, 6, 5, 4.5].map((r) => suggestSentiment(r, 7))).toEqual(["love", "love", "like", "like", "meh", "meh", "nope"]);
    // A generous rater's 8 is only a like, and their 6 is a no
    expect([9.5, 8, 6].map((r) => suggestSentiment(r, 8))).toEqual(["love", "like", "meh"]);
    expect(suggestSentiment(5.5, 8)).toBe("nope");
  });
});

describe("ratingBaseline", () => {
  it("uses a typical average until there are enough ratings to go on", () => {
    expect(ratingBaseline([10, 10, 9])).toBe(7);
    expect(ratingBaseline([8, 7, 7, 6, 7])).toBe(7);
  });

  it("keeps a very generous or very harsh rater's average in range", () => {
    expect(ratingBaseline([10, 9, 9, 9, 10, 9])).toBe(8);
    expect(ratingBaseline([3, 4, 5, 5, 6])).toBe(6.5);
  });
});

describe("suggestSentiments", () => {
  it("suggests a face for each game from the same average", () => {
    const ratings = new Map([
      [1, 10],
      [2, 8],
      [3, 8],
      [4, 7],
      [5, 4],
    ]);
    // Their average is 7.4: 10 is a love, 8 and 7 likes, 4 a no
    expect([...suggestSentiments(ratings)]).toEqual([
      [1, "love"],
      [2, "like"],
      [3, "like"],
      [4, "like"],
      [5, "nope"],
    ]);
  });
});

describe("formatBggRating", () => {
  it("shows whole numbers bare and the rest to one place", () => {
    expect([8, 7.25, 6.5].map(formatBggRating)).toEqual(["8", "7.3", "6.5"]);
  });
});
