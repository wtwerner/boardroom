/**
 * Night titles made from the group's template ("{date} Game Night — {game}"): the date as
 * "10/29", and the locked-in game or TBD. Pure and safe in client components, so the site's
 * form can fill the name in as the date changes.
 */

/** What {game} says before a game is locked in */
export const NO_GAME = "TBD";

/** "2026-10-29" as "10/29" */
export function titleDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/** A title from the template, for a night on `date` (YYYY-MM-DD) */
export function fillTitle(template: string, date: string, game: string | null = null) {
  return template.replaceAll("{date}", titleDate(date)).replaceAll("{game}", game || NO_GAME).trim().slice(0, 100);
}

/**
 * Whether `title` is one the template would make for that date, whatever game is in it: its
 * game part when it is ("" when the template has no game), null when it was named by hand
 */
export function titleGame(title: string, template: string, date: string): string | null {
  const [before, ...rest] = template.replaceAll("{date}", titleDate(date)).split("{game}");
  if (!rest.length) return title === before.trim() ? "" : null;
  const after = rest.join("{game}");
  if (title.length <= before.length + after.length || !title.startsWith(before) || !title.endsWith(after)) return null;
  return title.slice(before.length, title.length - after.length).trim() || null;
}

/**
 * The title with the game in it now: a title the template made swaps its game for `game` (TBD
 * when there's none), and one named by hand stays as it is
 */
export function retitle(title: string, template: string, date: string, game: string | null) {
  return titleGame(title, template, date) === null ? title : fillTitle(template, date, game);
}
