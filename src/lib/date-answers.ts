/**
 * The rules for answering the dates a night might be on (poll-store.ts): what each person's
 * answer to each date is, how answers become a night's answers once its date is set, and back
 * when that date falls through, and which dates are best. Pure and safe in client components.
 */

import type { DateAnswer, RsvpStatus } from "@/db/enums";

export type OptionFacts = { id: number; /** ISO */ createdAt: string; fellThrough: boolean };
export type GivenAnswer = { optionId: number; playerId: number; answer: DateAnswer; /** ISO */ at: string };
export type DateAnswerOf = { playerId: number; answer: DateAnswer; at: string; /** Not said: they answered other dates and left this one */ assumed: boolean };

/**
 * Everyone's answer to each date, in the order they gave them. Someone who has answered any
 * date that's still on offer counts as can't for one they left alone, unless it was added after
 * their last answer: then they haven't seen it, so they're waiting on it. A date that fell
 * through only has the answers given to it.
 */
export function resolveAnswers(options: OptionFacts[], given: GivenAnswer[]): { optionId: number; answers: DateAnswerOf[] }[] {
  const live = new Set(options.filter((o) => !o.fellThrough).map((o) => o.id));
  const lastAt = new Map<number, string>();
  for (const a of given) {
    if (!live.has(a.optionId)) continue;
    const was = lastAt.get(a.playerId);
    if (!was || Date.parse(a.at) > Date.parse(was)) lastAt.set(a.playerId, a.at);
  }
  return options.map((o) => {
    const said = given.filter((a) => a.optionId === o.id).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const saidBy = new Set(said.map((a) => a.playerId));
    const assumed = o.fellThrough
      ? []
      : [...lastAt].filter(([playerId, at]) => !saidBy.has(playerId) && Date.parse(o.createdAt) <= Date.parse(at)).map(([playerId, at]) => ({ playerId, answer: "no" as const, at, assumed: true }));
    return { optionId: o.id, answers: [...said.map((a) => ({ playerId: a.playerId, answer: a.answer, at: a.at, assumed: false })), ...assumed] };
  });
}

/** Everyone who has answered a date still on offer */
export function answeredBy(options: OptionFacts[], given: GivenAnswer[]) {
  const live = new Set(options.filter((o) => !o.fellThrough).map((o) => o.id));
  return new Set(given.filter((a) => live.has(a.optionId)).map((a) => a.playerId));
}

/** A date's answer as the night's, once it's set */
export const rsvpFor = (answer: DateAnswer): Exclude<RsvpStatus, "waitlist"> => (answer === "yes" ? "going" : answer === "maybe" ? "maybe" : "declined");

/** A night's answer as its date's, when the date falls through */
export const answerFor = (status: RsvpStatus): DateAnswer => (status === "going" || status === "waitlist" ? "yes" : status === "maybe" ? "maybe" : "no");

/** Works for me on the post: on when it wasn't yes, and off (can't) when it was */
export const toggleWorks = (current: DateAnswer | null): DateAnswer => (current === "yes" ? "no" : "yes");

/**
 * The dates that can still be set, best first: the most who can come (it works, or it does if
 * they have to), then the fewest who'd only come if they have to, then the soonest
 */
export function rankDates<T extends { startsAt: string; past: boolean; fellThrough?: boolean; yes: unknown[]; maybe: unknown[] }>(dates: T[]): T[] {
  return dates
    .filter((d) => !d.past && !d.fellThrough)
    .sort((a, b) => b.yes.length + b.maybe.length - (a.yes.length + a.maybe.length) || a.maybe.length - b.maybe.length || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
