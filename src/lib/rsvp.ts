/**
 * Answers for the nights Boardroom runs: who's going, who's a maybe and who can't make it,
 * whether they answered on the site or with the buttons on the night's post in Discord.
 * Pure, so the site's actions and the Discord handlers follow the same rules.
 */

import type { RsvpStatus } from "@/db/enums";

/** People one person can bring along without naming them */
export const MAX_GUESTS = 5;

export type RsvpAnswer = { status: RsvpStatus; guests: number };

/**
 * What an answer becomes. Guests come along with someone who's going or might, so they're
 * dropped when someone can't make it. Changing between going and maybe keeps the guests
 * unless new ones are given.
 */
export function nextAnswer(current: RsvpAnswer | null, status: RsvpStatus, guests?: number): RsvpAnswer {
  if (status === "declined") return { status, guests: 0 };
  const wanted = guests ?? current?.guests ?? 0;
  return { status, guests: Math.max(0, Math.min(MAX_GUESTS, Math.trunc(wanted) || 0)) };
}

export type RsvpRow = { playerId: number; status: RsvpStatus; guests: number; respondedAt: Date };

/** Someone who answered for a night, as its page and post show them */
export type Attendee = {
  name: string;
  playerId: number;
  userId: string | null;
  /** People they're bringing who aren't named */
  guests?: number;
  /** For mentioning them in the night's post */
  discordId?: string | null;
};

/** Answers grouped by status, earliest answer first within each, as the night's post lists them */
export function groupAnswers<R extends RsvpRow>(rows: R[]) {
  const sorted = [...rows].sort((a, b) => a.respondedAt.getTime() - b.respondedAt.getTime());
  const by = (s: RsvpStatus) => sorted.filter((r) => r.status === s);
  return { going: by("going"), maybe: by("maybe"), declined: by("declined"), waitlist: by("waitlist") };
}

/** Everyone going: the people who answered, everyone they're bringing, and others counted by hand */
export function headcount(going: { guests?: number }[], others: number) {
  return going.reduce((n, a) => n + 1 + (a.guests ?? 0), 0) + others;
}
