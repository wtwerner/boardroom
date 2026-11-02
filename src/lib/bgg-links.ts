/**
 * Links into BoardGameGeek's pages for a game. BGG's paths are /boardgame/{id}/{slug}/{page}: the
 * slug can't be left out, or BGG reads the page ("files") as the slug and shows the game's overview.
 * BGG doesn't check the slug, so one made from the name is enough.
 */

export function bggSlug(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "game";
}

export function bggUrl(id: number, name: string, page?: "files" | "videos/instructional") {
  const base = `https://boardgamegeek.com/boardgame/${id}/${bggSlug(name)}`;
  return page ? `${base}/${page}` : base;
}

/** What every game gets for prep before anything the group adds: BGG's rules files and teach videos */
export function bggPrepLinks(id: number, name: string) {
  return [
    { label: "Rules and player aids on BGG", url: bggUrl(id, name, "files") },
    { label: "How-to-play videos on BGG", url: bggUrl(id, name, "videos/instructional") },
  ];
}
