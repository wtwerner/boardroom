/**
 * Who gets in and what each kind of account can do. Boardroom decides someone's access; Discord's
 * member role is kept in step with it (it still decides who sees the core group's channels), and
 * only read the first time someone signs in. Pure, so the rules are tested; auth.ts applies the
 * sign-in rule and actions.ts the changes admins make.
 */

import type { Access } from "@/db/enums";
import type { SignInRefusal } from "./sign-in-refusal";

export type SignInFacts = {
  /** In the group's Discord server */
  inServer: boolean;
  /** Holds the member role; null when the group hasn't chosen one */
  hasRole: boolean | null;
  /** Their access, if they've signed in before */
  existing: Access | null;
  /** Casual sign-in is on (and the group has a casual night) */
  casualSignIn: boolean;
};

/**
 * Whether someone can sign in, and as what. Anyone not in the server is turned away. After the
 * first time, it's what Boardroom says, not the role: an admin moves people up or down, and
 * someone removed stays out. The first time, the role decides: with it they're a member; without
 * it they're a casual account when casual sign-in is on, and turned away when it isn't. A group
 * with no member role lets everyone in as a member, unless casual sign-in is on, when new people
 * start casual and an admin moves them up.
 */
export function signInAccess(f: SignInFacts): { ok: true; access: "member" | "casual" } | { ok: false; refusal: SignInRefusal } {
  if (!f.inServer) return { ok: false, refusal: "not_in_server" };
  // Removed reads like a missing role: the page doesn't say someone was removed
  if (f.existing === "removed") return { ok: false, refusal: "missing_role" };
  if (f.existing) return { ok: true, access: f.existing };
  if (f.hasRole) return { ok: true, access: "member" };
  if (f.casualSignIn) return { ok: true, access: "casual" };
  if (f.hasRole === null) return { ok: true, access: "member" };
  return { ok: false, refusal: "missing_role" };
}

export type AccessTarget = { id: string; access: Access; isAdmin: boolean };

/**
 * Why an admin can't change someone to `to`, or null when they can. Nobody changes their own
 * access (an admin can't lock themselves out), and an admin stays a member until someone takes
 * their admin away first, so the group never loses its last admin by accident.
 */
export function accessChangeRefusal(actorId: string, target: AccessTarget, to: Access): string | null {
  if (target.id === actorId) return "You can't change your own access.";
  if (target.access === to) return null;
  if (target.isAdmin && to !== "member") return "They're an admin. Take that away first.";
  return null;
}

/**
 * Where Discord's member role and Boardroom disagree, for admins to settle: a casual or removed
 * account holding the role (it shows them the core group's channels), or a member without it.
 * Null when they agree, or when the group has no role or Discord couldn't say.
 */
export function roleMismatch(access: Access, hasRole: boolean | null): "extra-role" | "missing-role" | null {
  if (hasRole === null) return null;
  if (access === "member" && !hasRole) return "missing-role";
  if (access !== "member" && hasRole) return "extra-role";
  return null;
}

/** What one kind of account can do with one thing: all of it, their own, on the casual night only, or nothing */
export type Allowed = "yes" | "own" | "casual" | "no";

/**
 * What each kind of account can do, for the admins' page. A description of the rules that
 * requireMember, requireAdmin and the casual checks in actions.ts enforce: change one, change both.
 */
export const CAPABILITIES: { area: string; what: string; admin: Allowed; member: Allowed; casual: Allowed }[] = [
  { area: "Their own", what: "Rate and rank games", admin: "yes", member: "yes", casual: "yes" },
  { area: "Their own", what: "Name, color, calendar and BGG collection", admin: "yes", member: "yes", casual: "yes" },
  { area: "Their own", what: "Board Game Arena name", admin: "yes", member: "yes", casual: "no" },
  { area: "Events", what: "See and answer events", admin: "yes", member: "yes", casual: "casual" },
  { area: "Events", what: "Answer for someone else", admin: "yes", member: "yes", casual: "no" },
  { area: "Events", what: "Make, edit, move or delete events", admin: "yes", member: "yes", casual: "no" },
  { area: "Events", what: "Bring games and ask others to bring", admin: "yes", member: "yes", casual: "casual" },
  { area: "Events", what: "Propose, vote on and lock in the game", admin: "yes", member: "yes", casual: "no" },
  { area: "Plays", what: "Log plays", admin: "yes", member: "yes", casual: "casual" },
  { area: "Plays", what: "Edit or delete plays", admin: "yes", member: "yes", casual: "own" },
  { area: "Plays", what: "Sync from Discord, fix names, merge players", admin: "yes", member: "yes", casual: "no" },
  { area: "Group", what: "Shelf, People, Discover, Online and Plays pages", admin: "yes", member: "yes", casual: "no" },
  { area: "Group", what: "Counted in the group's rankings and Discover", admin: "yes", member: "yes", casual: "no" },
  { area: "Group", what: "Counted in the casual night's list and planner", admin: "yes", member: "yes", casual: "yes" },
  { area: "Group", what: "Buy list, Claude's picks, prep links", admin: "yes", member: "yes", casual: "no" },
  { area: "Admin", what: "Group settings, and who's an admin", admin: "yes", member: "no", casual: "no" },
  { area: "Admin", what: "Move people up, down or out", admin: "yes", member: "no", casual: "no" },
];
