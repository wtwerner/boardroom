/**
 * Turns a play-log message into structured plays. Understands the group's
 * emoji template (📅 date / 📍 place / 🤼 @mentions / 🎲 [Game](bgg link), or 🎲: with
 * one "- [Game](bgg link)" per line below it, or the bot's own symbols in their place) as
 * well as plain "Game: Cascadia / Players: Sam, Alex" lines. Pure and synchronous so it's easy to test; messages it
 * can't make sense of fall through to the Claude-based parser in `ai.ts`.
 */

export type ParsedPlayer = {
  name: string;
  discordId?: string;
  /** Who it is, when the site already knows (picked on the log form): never matched by name */
  playerId?: number;
};

export type ParsedPlay = {
  gameName: string;
  /** Set when the message links the game on BGG */
  bggId?: number;
  playedOn: string; // YYYY-MM-DD
  location?: string;
  notes?: string;
  players: ParsedPlayer[];
};

export type MessageInput = {
  content: string;
  /** ISO timestamp of the message; used as the default play date */
  timestamp: string;
  mentions?: { id: string; username: string; global_name: string | null }[];
  timeZone?: string;
};

// Winners and scores are deliberately not tracked. Old posts with 🏆 / "Winner:"
// lines still parse; those lines are just ignored.
type Field = "game" | "games" | "players" | "date" | "location" | "scores" | "notes";

const KEY_SYNONYMS: Record<string, Field> = {
  game: "game",
  title: "game",
  "board game": "game",
  played: "games",
  games: "games",
  "games played": "games",
  players: "players",
  player: "players",
  who: "players",
  attendees: "players",
  attendance: "players",
  people: "players",
  crew: "players",
  with: "players",
  date: "date",
  when: "date",
  day: "date",
  location: "location",
  where: "location",
  place: "location",
  host: "location",
  hosted: "location",
  "hosted by": "location",
  at: "location",
  score: "scores",
  scores: "scores",
  "final score": "scores",
  "final scores": "scores",
  notes: "notes",
  note: "notes",
  comments: "notes",
  thoughts: "notes",
};

const EMOJI_KEYS: Record<string, Field> = {
  "📅": "date",
  "🗓": "date",
  "📆": "date",
  "📍": "location",
  "🏠": "location",
  "🤼": "players",
  "👥": "players",
  "🧑‍🤝‍🧑": "players",
  "🎲": "game",
  "♟": "game",
  "💯": "scores",
  "📝": "notes",
};

/** The bot's own emoji (src/lib/icons.ts) that start play-post lines, by name: their ids differ in each group's app */
const APP_EMOJI_KEYS: Record<string, Field> = {
  date: "date",
  place: "location",
  players: "players",
  playing: "game",
  notes: "notes",
};

const LINE_RE = /^\s*(?:[-*•>]\s*)?([A-Za-z][A-Za-z ]{0,20}?)\s*[:=]\s*(.+?)\s*$/;
const EMOJI_LINE_RE = /^\s*(\p{Extended_Pictographic}(?:[\u200d\ufe0f]|\p{Extended_Pictographic})*)\s*:?\s*(.+?)\s*$/u;
/** A line starting with a custom emoji, <:name:id> */
const APP_EMOJI_LINE_RE = /^\s*<a?:(\w+):\d+>\s*:?\s*(.+?)\s*$/;
const MENTION_RE = /<@!?(\d+)>/g;
/** "- Cascadia" under a "🎲:" or "Games:" line with nothing after it */
const BULLET_RE = /^\s*[-*•]\s+(.+?)\s*$/;
const MENTIONS_ONLY_RE = /^(?:[\s,&]*<@!?\d+>)+[\s,&]*$/;
const MD_LINK_RE = /\[([^\]]+)\]\(<?(https?:\/\/[^)>\s]+)>?\)/;
const BGG_ID_RE = /boardgamegeek\.com\/(?:boardgame|boardgameexpansion|thing)\/(\d+)/;

export function parsePlayMessage(msg: MessageInput): ParsedPlay[] | null {
  const mentions = msg.mentions ?? [];
  // Mentions stay as <@id> here so player lines keep their Discord ids
  const fields: Partial<Record<Field, string>> = {};

  /** A field whose line had no value, so the bullets under it belong to it */
  let listOf: Field | undefined;
  for (const line of stripMarkdown(msg.content).split("\n")) {
    if (!line.trim()) continue;
    const bullet = listOf && BULLET_RE.exec(line);
    if (bullet && listOf) {
      fields[listOf] = fields[listOf] ? `${fields[listOf]}\n${bullet[1]}` : bullet[1];
      continue;
    }
    listOf = listHeader(line);
    const appEmoji = APP_EMOJI_LINE_RE.exec(line);
    const emoji = appEmoji ? null : EMOJI_LINE_RE.exec(line);
    const m = appEmoji || emoji ? null : LINE_RE.exec(line);
    const field = appEmoji
      ? APP_EMOJI_KEYS[appEmoji[1]]
      : emoji
        ? EMOJI_KEYS[emoji[1].replace(/\ufe0f/g, "")]
        : m
          ? KEY_SYNONYMS[m[1].trim().toLowerCase()]
          : undefined;
    const value = (appEmoji ?? emoji ?? m)?.[2];
    if (field && value) {
      fields[field] = fields[field] ? `${fields[field]}\n${value}` : value;
    }
  }

  const games = [
    ...(fields.game ? splitGames(fields.game) : []),
    ...(fields.games ? splitGames(fields.games) : []),
  ]
    .map(parseGameRef)
    // "- ??" for a game nobody remembered
    .filter((g) => g.bggId || /[\p{L}\p{N}]/u.test(g.name));
  if (games.length === 0) return null;

  const players = new Map<string, ParsedPlayer>();
  /** `literal` names (from mentions) are used as-is rather than having a trailing "score" stripped */
  const addPlayer = (raw: string, discordId?: string, literal = false) => {
    const name = literal ? raw : stripScore(raw);
    if (!name) return;
    const key = discordId ?? norm(name);
    if (!players.has(key)) players.set(key, { name, discordId });
  };
  const addPeople = (raw: string) => {
    // "🤼 <@1> <@2> <@3>" — space-separated mentions, each one a person
    if (MENTIONS_ONLY_RE.test(raw)) {
      for (const [, id] of raw.matchAll(MENTION_RE)) {
        const u = mentions.find((x) => x.id === id);
        addPlayer(u ? u.global_name || u.username : `Discord user ${id}`, id, true);
      }
      return;
    }
    // "<@1> <@2> +Chad": mentions and +guests only separated by spaces are still one person each
    for (const part of splitList(raw.replace(/\s+(?=<@|\+\S)/g, ", "))) {
      // "+ his fam" says who else came, not who
      if (/^(?:his|her|their|my|our)\b/i.test(part)) continue;
      // A lone mention keeps its id even when Discord didn't send who it is
      const id = /^<@!?(\d+)>$/.exec(part)?.[1];
      if (id) {
        const u = mentions.find((x) => x.id === id);
        addPlayer(u ? u.global_name || u.username : `Discord user ${id}`, id, true);
        continue;
      }
      const text = resolveMentions(part, mentions);
      const u = mentions.find((x) => norm(x.global_name || x.username) === norm(stripScore(text)));
      addPlayer(text, u?.id);
    }
  };

  if (fields.players) addPeople(fields.players);
  // A scores line still says who was there
  if (fields.scores) addPeople(fields.scores);

  const playedOn = parseDate(fields.date, msg.timestamp, msg.timeZone) ?? toLocalDate(msg.timestamp, msg.timeZone);

  return games.map(({ name, bggId }) => ({
    gameName: name,
    ...(bggId ? { bggId } : {}),
    playedOn,
    location: fields.location?.trim() || undefined,
    notes: fields.notes?.trim() || undefined,
    players: [...players.values()].map((p) => ({ ...p })),
  }));
}

// ---------------------------------------------------------------------------

/** The field a line names without giving it a value ("🎲:", "Games:"), so a list follows */
function listHeader(line: string): Field | undefined {
  const emoji = /^\s*(\p{Extended_Pictographic}(?:[\u200d\ufe0f]|\p{Extended_Pictographic})*)\s*:?\s*$/u.exec(line);
  if (emoji) return EMOJI_KEYS[emoji[1].replace(/\ufe0f/g, "")];
  const key = /^\s*([A-Za-z][A-Za-z ]{0,20}?)\s*:\s*$/.exec(line);
  return key ? KEY_SYNONYMS[key[1].trim().toLowerCase()] : undefined;
}

function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, (block) => block.slice(3, -3))
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/g, "$1$2")
    .replace(/^#+\s*/gm, "")
    // Markdown escapes the app adds around names ("\*Sam\*")
    .replace(/\\([\\*_~`|[\]])/g, "$1");
}

/** "[Dune Imperium Uprising](https://boardgamegeek.com/boardgame/397598/…)" → name + BGG id */
function parseGameRef(raw: string): { name: string; bggId?: number } {
  const link = MD_LINK_RE.exec(raw);
  const url = link?.[2] ?? raw;
  const id = BGG_ID_RE.exec(url)?.[1];
  const name = (link?.[1] ?? raw.replace(/<?https?:\/\/\S+>?/, "")).trim();
  return { name: name || `BGG #${id}`, ...(id ? { bggId: Number(id) } : {}) };
}

function resolveMentions(s: string, mentions: NonNullable<MessageInput["mentions"]>) {
  return s.replace(MENTION_RE, (_, id: string) => {
    const u = mentions.find((m) => m.id === id);
    return u ? u.global_name || u.username : "";
  });
}

// Game titles contain "and" / "&" often enough that only hard separators split them
const GAME_SEPARATORS = /\n|,|;|\s\+\s/;
/** A markdown link, or a bare URL */
const LINKS_RE = /\[[^\]]+\]\(<?https?:\/\/[^)>\s]+>?\)|<?https?:\/\/[^\s>]+>?/g;

/** "[A](…) + [B](…)", "[A](…) & [B](…)": when a part links several games, each link is one */
function splitGames(value: string): string[] {
  return splitList(value, GAME_SEPARATORS).flatMap((part) => {
    const links = part.match(LINKS_RE);
    return links && links.length > 1 ? links : [part];
  });
}
const NAME_SEPARATORS = /\n|,|;|\s&\s|\s\+\s|\band\b|\s\/\s/;

function splitList(value: string, separators = NAME_SEPARATORS): string[] {
  return value
    .split(separators)
    .map((s) => s.replace(/^[-*•@+\s]+/, "").trim())
    .filter(Boolean);
}

/** "Sam (87)" / "Sam - 87" / "Sam 87" / "Sam: 87 pts" → "Sam" */
function stripScore(raw: string): string {
  const m = /^(.+?)[\s:(–-]+(-?\d+(?:\.\d+)?)\s*(?:pts?|points|vp)?\)?$/i.exec(raw.trim());
  if (m && !/^\d+$/.test(m[1].trim())) return m[1].trim();
  return raw.replace(/[()]/g, "").trim();
}

const norm = (s: string) => s.trim().toLowerCase();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Parses the date field relative to when the message was posted. */
export function parseDate(raw: string | undefined, timestamp: string, timeZone?: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const posted = toLocalDate(timestamp, timeZone);
  const [py, pm, pd] = posted.split("-").map(Number);

  if (/^today|tonight/.test(s)) return posted;
  if (/^yesterday|last night/.test(s)) return addDays(posted, -1);

  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);

  // US-style 10/12, 10/12/25, 10/12/2025
  m = /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/.exec(s);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : inferYear(py, pm, +m[1]);
    return ymd(year, +m[1], +m[2]);
  }

  // "Oct 12", "October 12th, 2025", "12 Oct"
  m = /([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/.exec(s);
  let monthIdx = m ? MONTHS.indexOf(m[1].slice(0, 3)) : -1;
  if (m && monthIdx >= 0) {
    return ymd(m[3] ? +m[3] : inferYear(py, pm, monthIdx + 1), monthIdx + 1, +m[2]);
  }
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})(?:,?\s+(\d{4}))?/.exec(s);
  monthIdx = m ? MONTHS.indexOf(m[2].slice(0, 3)) : -1;
  if (m && monthIdx >= 0) {
    return ymd(m[3] ? +m[3] : inferYear(py, pm, monthIdx + 1), monthIdx + 1, +m[1]);
  }

  // "Friday" / "last Friday" → most recent such day on or before the post
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}`).test(s));
  if (wd >= 0) {
    const postedDow = new Date(Date.UTC(py, pm - 1, pd)).getUTCDay();
    return addDays(posted, -((postedDow - wd + 7) % 7));
  }

  return null;
}

/** A date without a year that's later in the calendar than the post must be last year's. */
function inferYear(postedYear: number, postedMonth: number, month: number) {
  return month > postedMonth + 1 ? postedYear - 1 : postedYear;
}

export function toLocalDate(iso: string, timeZone = "UTC") {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ---------------------------------------------------------------------------
// Writing the group's template (for plays logged in the app)
// ---------------------------------------------------------------------------

export type FormattablePlay = {
  /** One or more games played together, written as "🎲: A + B" */
  games: { gameName: string; bggId?: number | null }[];
  playedOn: string;
  location?: string | null;
  notes?: string | null;
  players: { name: string; discordId?: string | null }[];
};

/** Renders plays in the same emoji template people post by hand, so they parse back identically. */
export function formatPlayMessage(p: FormattablePlay): string {
  const [y, m, d] = p.playedOn.split("-").map(Number);
  const tag = (pl: FormattablePlay["players"][number]) => (pl.discordId ? `<@${pl.discordId}>` : pl.name);
  return [
    `📅 **${m}/${d}/${String(y).slice(2)}**`,
    p.location && `📍 ${p.location}`,
    `🤼 ${p.players.map(tag).join(", ")}`,
    `🎲: ${p.games.map((g) => (g.bggId ? `[${g.gameName}](https://boardgamegeek.com/boardgame/${g.bggId})` : g.gameName)).join(" + ")}`,
    p.notes && `📝 ${p.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}
