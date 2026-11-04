/**
 * Coming up on Discover: games to keep an eye on, all from BGG's API.
 *
 * - Opening soon: on a list BGG members keep of campaigns that haven't opened yet.
 * - Crowdfunded: recently added to BGG's Kickstarter or Gamefound families, dated this year or later.
 * - Trending and wishlisted: on BGG's hot list or someone's wishlist, dated this year or later.
 *
 * None of these say whether a campaign is funding right now, or whether a game dated this year
 * is out yet: BGG doesn't. What's here is pure; src/lib/catalog.ts does the fetching.
 */

/** BGG's game families for crowdfunded games */
export const CROWDFUNDING_FAMILIES = [
  { id: 8374, platform: "Kickstarter" },
  { id: 66292, platform: "Gamefound" },
] as const;
/** The BGG geeklist "Prelaunched Crowdfunding Board Game Projects" */
export const PRELAUNCH_LIST_ID = 290810;
export const PRELAUNCH_LIST_URL = `https://boardgamegeek.com/geeklist/${PRELAUNCH_LIST_ID}/prelaunched-crowdfunding-board-game-projects`;

/** How far back each family is read: enough to reach games still funding, which were added to BGG months before */
export const NEWEST_IN_FAMILY = 650;
/** How many games each group on Coming up shows */
export const UPCOMING_PER_GROUP = 6;
/** Below this it isn't worth keeping an eye on. Lower than Claude's picks' 60%: without BGG's rating, these sit nearer the middle. */
export const MIN_UPCOMING_CHANCE = 0.5;
/** An entry on the list with no date stops counting this long after anyone last touched it */
const UNDATED_MONTHS = 12;
/** Details this old are fetched again, since a new game's weight and mechanics fill in over time */
export const DETAILS_STALE_DAYS = 30;

/** How the list's entries spell each platform, typos included ("Kickstarting Date", "Gemfound Date") */
const PLATFORMS: [RegExp, string][] = [
  [/kickstart/i, "Kickstarter"],
  [/g[ae]me?found/i, "Gamefound"],
  [/backerkit/i, "BackerKit"],
  [/indi[e]?gog?o/i, "Indiegogo"],
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const monthOf = (year: string, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Reads a date as people write it: "January 2027", "Jan 12, 2027", "5th of March, 2027", "Q1, 2027", "Early 2027", "2026 or 2027" */
export function parseLaunchDate(text: string): { label: string; until: string } | null {
  const value = text.trim();
  const month = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(?:\d{1,2}(?:st|nd|rd|th)?,?\s+)?((?:19|20)\d{2})\b/i);
  if (month) {
    const index = MONTHS.findIndex((m) => m.toLowerCase().startsWith(month[1].toLowerCase()));
    return { label: `${MONTHS[index]} ${month[2]}`, until: monthOf(month[2], index + 1) };
  }
  const quarter = value.match(/\bQ([1-4])\D{0,3}((?:19|20)\d{2})\b/i);
  if (quarter) return { label: `Q${quarter[1]} ${quarter[2]}`, until: monthOf(quarter[2], Number(quarter[1]) * 3) };
  // With two years to choose from, it could be as late as the last
  const years = value.match(/\b(?:19|20)\d{2}\b/g);
  if (years && value.length <= 30) return { label: value, until: monthOf(years[years.length - 1], 12) };
  return null;
}

/** What an entry on the members' list says, from its first lines: "[b]Kickstarter Date[/b] January 2027", or "Gamefound Date: Q4, 2026" without the bold */
export function parsePrelaunchBody(body: string): { platform: string | null; launch: string | null; launchUntil: string | null } {
  const field = body.slice(0, 300).match(/^\s*(?:\[b\])?\s*([^\n[\]:]{0,50}?\b(?:date|launch)\b)[^\n[\]:]{0,30}?\s*:?\s*(?:\[\/b\])?\s*:?\s*([^[\n]*)/im);
  if (!field) return { platform: null, launch: null, launchUntil: null };
  const platform = PLATFORMS.find(([spelling]) => spelling.test(field[1]))?.[1] ?? null;
  const date = parseLaunchDate(field[2]);
  return { platform, launch: date?.label ?? null, launchUntil: date?.until ?? null };
}

export type PrelaunchEntry = { id: number; platform: string | null; launch: string | null; launchUntil: string | null; touchedAt: Date };

/** Whether it can still be yet to open: its date hasn't gone by, or with no date, someone touched it lately. */
export function isStillPrelaunch(e: Pick<PrelaunchEntry, "launchUntil" | "touchedAt">, today: string): boolean {
  if (e.launchUntil) return e.launchUntil >= today.slice(0, 7);
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCMonth(oldest.getUTCMonth() - UNDATED_MONTHS);
  return e.touchedAt >= oldest;
}

export type UpcomingSource = { platform: string | null; prelaunch: boolean; launch: string | null; launchUntil: string | null };

/**
 * Every game worth knowing about, and in the order to fetch their details: campaigns yet to open
 * first, then newest first by BGG id, which goes up as games are added. The list knows the platform
 * better than the families, where a game can be in both.
 */
export function collectUpcoming(families: { platform: string; ids: number[] }[], prelaunch: PrelaunchEntry[], today: string): Map<number, UpcomingSource> {
  const familyGames = new Map<number, string>();
  for (const f of families) {
    for (const id of [...f.ids].sort((a, b) => b - a).slice(0, NEWEST_IN_FAMILY)) familyGames.set(id, f.platform);
  }
  const out = new Map<number, UpcomingSource>();
  for (const e of prelaunch) {
    if (!isStillPrelaunch(e, today)) continue;
    out.set(e.id, { platform: e.platform ?? familyGames.get(e.id) ?? null, prelaunch: true, launch: e.launch, launchUntil: e.launchUntil });
  }
  for (const [id, platform] of [...familyGames].sort((a, b) => b[0] - a[0])) {
    if (!out.has(id)) out.set(id, { platform, prelaunch: false, launch: null, launchUntil: null });
  }
  return out;
}

export type UpcomingKind = "opening" | "crowdfunded" | "new";

/** The groups on Coming up, in order */
export const UPCOMING_GROUPS: { kind: UpcomingKind; title: string }[] = [
  { kind: "opening", title: "Opening soon" },
  { kind: "crowdfunded", title: "Crowdfunded" },
  { kind: "new", title: "Trending and wishlisted" },
];

const yearWords = (year: number | null, thisYear: number) => (year === null ? "no release year yet" : year > thisYear ? `due in ${year}` : `new in ${year}`);
const capitalized = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Whether a game belongs on Coming up, which group, and what its card says. A game on a list of
 * campaigns yet to open counts whatever its year; otherwise it has to be dated this year or later,
 * or be a recent or trending game with no year yet. A wishlist game with no year may only be
 * missing its details, so that doesn't count.
 */
export function upcomingStatus(
  g: { year: number | null; source: UpcomingSource | null; trending: boolean; wishlisted: boolean },
  today: string,
): { kind: UpcomingKind; line: string } | null {
  const thisYear = Number(today.slice(0, 4));
  const { source, year } = g;
  if (source?.prelaunch && (!source.launchUntil || source.launchUntil >= today.slice(0, 7))) {
    const where = source.platform ? `Opening on ${source.platform}` : "Campaign coming";
    return { kind: "opening", line: source.launch ? `${where}, ${source.launch}` : where };
  }
  const datedAhead = year !== null && year >= thisYear;
  if (source && (datedAhead || year === null)) {
    return { kind: "crowdfunded", line: `Crowdfunded${source.platform ? ` on ${source.platform}` : ""}, ${yearWords(year, thisYear)}` };
  }
  if ((g.trending || g.wishlisted) && datedAhead) return { kind: "new", line: capitalized(yearWords(year, thisYear)) };
  if (g.trending && year === null) return { kind: "new", line: capitalized(yearWords(year, thisYear)) };
  return null;
}
