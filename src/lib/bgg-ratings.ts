/**
 * Someone's own BGG ratings (1–10), read as the site's faces. A 7 means different things from
 * different people, so each rating is read against the person's own average on BGG rather than
 * fixed cutoffs: well above it is a love, around it a like, below it a meh, well below a no.
 * These are suggestions: nothing is rated until the person accepts one.
 */

import type { Sentiment } from "@/db/enums";

/** Ratings it takes before someone's own average counts; with fewer, a typical BGG average stands in */
export const OWN_AVERAGE_FROM = 5;
export const TYPICAL_AVERAGE = 7;
/** Their average is kept in this range, so a very generous or harsh rater doesn't swing every suggestion */
export const AVERAGE_RANGE = [6.5, 8] as const;

/** Where each face starts, in points from their average */
export const BANDS: { sentiment: Sentiment; from: number }[] = [
  { sentiment: "love", from: 1.5 },
  { sentiment: "like", from: -0.5 },
  { sentiment: "meh", from: -2 },
  { sentiment: "nope", from: -Infinity },
];

/** The average their ratings are read against */
export function ratingBaseline(ratings: number[]): number {
  if (ratings.length < OWN_AVERAGE_FROM) return TYPICAL_AVERAGE;
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.min(AVERAGE_RANGE[1], Math.max(AVERAGE_RANGE[0], mean));
}

export function suggestSentiment(rating: number, baseline: number): Sentiment {
  return BANDS.find((b) => rating >= baseline + b.from)!.sentiment;
}

/** A face for each rated game, read against the average of all of them */
export function suggestSentiments<K>(ratings: Map<K, number>): Map<K, Sentiment> {
  const baseline = ratingBaseline([...ratings.values()]);
  return new Map([...ratings].map(([k, r]) => [k, suggestSentiment(r, baseline)]));
}

/** 8 → "8", 7.25 → "7.3", as BGG shows them */
export const formatBggRating = (r: number) => String(Math.round(r * 10) / 10);
