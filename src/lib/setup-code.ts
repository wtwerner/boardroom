/**
 * The code that lets whoever put a new site up make its first account, before anyone else who
 * finds it can. Pure, so it's tested.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** The shortest setup code that protects a new site: it's typed once, so it can be long */
export const SETUP_CODE_MIN = 12;

/**
 * Why a new site's first account can't be made with what was given, or null when it can. The
 * first account is the admin, so a site on the internet asks for the code its owner put in
 * SETUP_CODE. Local development doesn't. A site with Discord sign-in gets its first member that
 * way, and one with any account is already set up.
 */
export function setupProblem(f: { accounts: number; discordSignIn: boolean; demo: boolean; dev: boolean; code: string | undefined; given: string }): string | null {
  if (f.accounts > 0 || f.discordSignIn || f.demo) return "This site is already set up.";
  if (f.dev) return null;
  if (!f.code) return "Set SETUP_CODE in the site's environment variables and redeploy, then come back here.";
  if (f.code.length < SETUP_CODE_MIN) return `SETUP_CODE is too short: make it ${SETUP_CODE_MIN} characters or more and redeploy.`;
  return same(f.given, f.code) ? null : "That isn't the site's setup code.";
}

/** Compared as hashes, so how long it takes says nothing about how close a guess was */
function same(a: string, b: string) {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(a.trim()), hash(b));
}
