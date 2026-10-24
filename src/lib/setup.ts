/**
 * The steps a member goes through to get set up, shared by the setup page (/welcome) and the
 * banner on Home that points there. Pure, so which steps count is tested.
 */

export type SetupStepKey = "claim" | "rate" | "rank" | "bgg" | "bga";

export type SetupStep = { key: SetupStepKey; title: string; done: boolean; optional: boolean };

export type SetupFacts = {
  /** Nothing in the play logs is tied to them yet, and there are untied names to choose from */
  needsClaim: boolean;
  rateDone: boolean;
  rankDone: boolean;
  /** A BGG username saved, or a collection imported */
  collection: boolean;
  /** A Board Game Arena name saved */
  bga: boolean;
};

export const STEP_TITLE: Record<SetupStepKey, string> = {
  claim: "Find yourself in past plays",
  rate: "Rate the games you've played",
  rank: "Rank them",
  bgg: "Add your BGG collection",
  bga: "Add your Board Game Arena name",
};

/** The steps in order. Finding yourself only shows while it's needed; the integrations are optional. */
export function setupSteps(f: SetupFacts): SetupStep[] {
  const steps: Omit<SetupStep, "title">[] = [
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
