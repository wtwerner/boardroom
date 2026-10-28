/**
 * The steps a member goes through to get set up, shared by the setup page (/welcome) and the
 * banner on Home that points there. Pure, so which steps count is tested.
 */

import { TIERS, type Tier } from "@/db/enums";

export type SetupStepKey = "name" | "claim" | "rate" | "rank" | "bgg" | "bga";

export type SetupStep = { key: SetupStepKey; title: string; done: boolean; optional: boolean };

export type SetupFacts = {
  /** They've saved the name the group sees, rather than keeping their Discord name by default */
  nameDone: boolean;
  /** Nothing in the play logs is tied to them yet, and there are untied names to choose from */
  needsClaim: boolean;
  rateDone: boolean;
  rankDone: boolean;
  /** A BGG username saved, or a collection imported */
  collection: boolean;
  /** A Board Game Arena name saved */
  bga: boolean;
};

const STEP_TITLE: Record<SetupStepKey, string> = {
  name: "Check your name",
  claim: "Find yourself in past plays",
  rate: "Rate the games you've played",
  rank: "Rank them",
  bgg: "Add your BoardGameGeek collection",
  bga: "Add your Board Game Arena name",
};

/** The steps in order. Finding yourself only shows while it's needed; the integrations are optional. */
export function setupSteps(f: SetupFacts): SetupStep[] {
  const steps: Omit<SetupStep, "title">[] = [
    { key: "name", done: f.nameDone, optional: false },
    ...(f.needsClaim ? [{ key: "claim" as const, done: false, optional: false }] : []),
    { key: "rate", done: f.rateDone, optional: false },
    { key: "rank", done: f.rankDone, optional: false },
    { key: "bgg", done: f.collection, optional: true },
    { key: "bga", done: f.bga, optional: true },
  ];
  return steps.map((s) => ({ ...s, title: STEP_TITLE[s.key] }));
}

/** How far through the steps that count someone is, and what to do next */
export function setupProgress(steps: SetupStep[]) {
  const needed = steps.filter((s) => !s.optional);
  const done = needed.filter((s) => s.done).length;
  return { done, total: needed.length, complete: done === needed.length, next: needed.find((s) => !s.done) ?? null };
}

/** Setup asks for a solid start in each list, not every game; later plays are nudged separately */
export const RANKED_TO_START = 10;

export type RankList = { tier: Tier; played: number; ranked: number; done: boolean };

/**
 * Where someone stands in each ranking list they've played games for. Each tier is its own list,
 * so a full list of one kind doesn't finish the step while the other hasn't been started.
 */
export function rankLists(played: { id: number; tier: Tier }[], ranked: Set<number>): RankList[] {
  return TIERS.flatMap((tier) => {
    const inTier = played.filter((g) => g.tier === tier);
    if (inTier.length === 0) return [];
    const n = inTier.filter((g) => ranked.has(g.id)).length;
    return [{ tier, played: inTier.length, ranked: n, done: n === inTier.length || n >= RANKED_TO_START }];
  });
}
