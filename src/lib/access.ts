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
  /** The group has a casual night: without one, a casual account has nothing to see */
  casualNight: boolean;
};

/**
 * Whether someone can sign in, and as what. Anyone not in the server is turned away. After the
 * first time, it's what Boardroom says, not the role: an admin moves people up or down, and
 * someone removed stays out, and so does a casual account while the group has no casual night (an
 * admin can make them a member). The first time, the role decides: with it they're a member; without
 * it they're a casual account when casual sign-in is on, and turned away when it isn't. A group
 * with no member role lets everyone in as a member, unless casual sign-in is on, when new people
 * start casual and an admin moves them up.
 */
export function signInAccess(f: SignInFacts): { ok: true; access: "member" | "casual" } | { ok: false; refusal: SignInRefusal } {
  if (!f.inServer) return { ok: false, refusal: "not_in_server" };
  // Removed reads like a missing role: the page doesn't say someone was removed
  if (f.existing === "removed") return { ok: false, refusal: "missing_role" };
  if (f.existing === "casual" && !f.casualNight) return { ok: false, refusal: "missing_role" };
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

/** What one kind of account can do with one thing: all of it, their own, on the nights they see (the casual night), or nothing */
export type Allowed = "yes" | "own" | "casual" | "no";

export type Capability = {
  area: string;
  what: string;
  admin: Allowed;
  member: Allowed;
  casual: Allowed;
  /** Only says something with a casual night */
  aboutCasual?: true;
  /**
   * The actions in actions.ts that do it, which access.test.ts holds to the row: no for casual
   * means requireMember, admins only means requireAdmin, and the casual night means requireNight
   * (or requireUser with its own check)
   */
  actions: string[];
};

/**
 * What each kind of account can do, for the admins' page, named with the group's names for its
 * nights. The rule: each kind of night has its own events, plays and group list, and a casual
 * account sees the casual night's; everything else is everyone's, but making and running events and
 * the group's housekeeping are the members', and settings and access the admins'.
 */
export function capabilities(names: { core: string; casual: string }): Capability[] {
  return [
    { area: "Their own", what: "Rate and rank games", admin: "yes", member: "yes", casual: "yes", actions: ["setOpinion", "saveRanking"] },
    {
      area: "Their own",
      what: "Name, color, calendar, BGG collection and Board Game Arena name",
      admin: "yes",
      member: "yes",
      casual: "yes",
      actions: ["renamePlayer", "setMyColor", "openCalendarSync", "newCalendarLink", "saveBggUsername", "importCsv", "saveBgaProfile"],
    },
    { area: "Seeing", what: "Every page: Home, Plan, Plays, Shelf, Rankings, People, Discover, Online", admin: "yes", member: "yes", casual: "yes", actions: [] },
    { area: "Seeing", what: `The ${names.core}'s events, plays and group list`, admin: "yes", member: "yes", casual: "no", actions: [] },
    { area: "Seeing", what: `Counted in the ${names.casual}'s list, planner and date polls`, admin: "yes", member: "yes", casual: "yes", actions: [], aboutCasual: true },
    {
      area: "Events",
      what: "Answer, for themselves or someone they're bringing, and say which dates work",
      admin: "yes",
      member: "yes",
      casual: "casual",
      actions: ["setRsvp", "setOthersComing", "answerDate", "noDatesWork"],
    },
    { area: "Events", what: "Suggest a date", admin: "yes", member: "yes", casual: "casual", actions: ["suggestPollDate"] },
    { area: "Events", what: "Bring games and ask others to bring", admin: "yes", member: "yes", casual: "casual", actions: ["addGameToNight", "askToBring", "answerBringAsk", "dropPlan"] },
    { area: "Events", what: "Vote on and prep the game, and ask Claude for picks", admin: "yes", member: "yes", casual: "casual", actions: ["setPlanVote", "setPrepped", "askClaudeForNight"] },
    {
      area: "Events",
      what: "Make, edit, date, call off or delete events, and lock in the game",
      admin: "yes",
      member: "yes",
      casual: "no",
      actions: ["addNight", "updateNight", "updateNightDetails", "deleteNight", "startPoll", "findNewDate", "setNightDate", "nudgeForDates", "callOffPoll", "reopenPoll", "choosePlan"],
    },
    { area: "Plays", what: "Log plays", admin: "yes", member: "yes", casual: "casual", actions: ["logPlay", "endNight"] },
    { area: "Plays", what: "Edit or delete plays", admin: "yes", member: "yes", casual: "own", actions: ["updatePlay", "deletePlay", "movePlay"] },
    {
      area: "Housekeeping",
      what: "Sync from Discord, fix game names, merge or split players",
      admin: "yes",
      member: "yes",
      casual: "no",
      actions: ["syncDiscordNow", "resolveGameName", "ignoreGameName", "setPlayerDiscord", "playerNightsFor", "splitPlayer", "settleWhich", "mergePlayers"],
    },
    { area: "Housekeeping", what: "Add prep links to a game", admin: "yes", member: "yes", casual: "yes", actions: ["addPrepLink"] },
    { area: "Housekeeping", what: "Take prep links off, move a game to the other ranking list", admin: "yes", member: "yes", casual: "no", actions: ["removePrepLink", "setGameTier"] },
    { area: "Housekeeping", what: "Load BGG's and BGA's lists now", admin: "yes", member: "yes", casual: "no", actions: ["loadCatalog", "loadBgaGames"] },
    {
      area: "Housekeeping",
      what: `The buy list, adding ideas and Claude's picks on Discover (written from the ${names.core}'s taste)`,
      admin: "yes",
      member: "yes",
      casual: "no",
      actions: ["wantGame", "unwantGame", "takeOffBuyList", "addSuggestion", "askClaudeForPicks"],
    },
    { area: "Admin", what: "Group settings, and who's an admin", admin: "yes", member: "no", casual: "no", actions: ["saveGroupSettings", "setAdmin"] },
    { area: "Admin", what: "Invite people, and move them up, down or off the site", admin: "yes", member: "no", casual: "no", actions: ["welcomeToGroup", "setAccess", "matchDiscordRole"] },
  ];
}
