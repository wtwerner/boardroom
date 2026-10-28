import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CLAUDE, NIGHT_NAMES } from "@/config";
import type { Night } from "@/db/enums";
import type { ParsedPlay } from "./play-parser";
import { inSentence } from "./text";

// The nights as the group names them, so Claude's reasons use the same words as the site
const CORE = inSentence(NIGHT_NAMES.core);
const CASUAL = inSentence(NIGHT_NAMES.casual);

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export const hasAnthropicKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
/** Claude is turned on and has a key to call it with */
export const claudeReady = () => CLAUDE && hasAnthropicKey();

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

async function ask<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort: "low" | "medium" | "high";
}): Promise<z.infer<T>> {
  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // On a safety decline, the API retries on a suitable fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (!res.parsed_output) throw new Error(`Claude returned no structured output (${res.stop_reason})`);
  return res.parsed_output;
}

// ---------------------------------------------------------------------------
// Play-log parsing fallback
// ---------------------------------------------------------------------------

const PlayLogSchema = z.object({
  isPlayLog: z.boolean().describe("false for chatter, scheduling, memes, etc."),
  plays: z.array(
    z.object({
      gameName: z.string(),
      playedOn: z.string().describe("YYYY-MM-DD"),
      location: z.string().nullable(),
      notes: z.string().nullable(),
      players: z.array(
        z.object({
          name: z.string(),
        }),
      ),
    }),
  ),
});

export async function parsePlayWithClaude(content: string, postedOn: string): Promise<ParsedPlay[] | null> {
  const out = await ask({
    effort: "low",
    schema: PlayLogSchema,
    system:
      "You extract board game play logs from a friend group's Discord channel. " +
      "One message may log several games from the same night — return one play per game. " +
      "Resolve relative dates (\"last night\", \"Friday\") against the date the message was posted. " +
      "Use the game's common English title as it appears on BoardGameGeek.",
    prompt: `Posted on ${postedOn}:\n\n${content}`,
  });
  if (!out.isPlayLog || out.plays.length === 0) return null;
  return out.plays.map((p) => ({
    gameName: p.gameName,
    playedOn: /^\d{4}-\d{2}-\d{2}$/.test(p.playedOn) ? p.playedOn : postedOn,
    location: p.location ?? undefined,
    notes: p.notes ?? undefined,
    players: p.players.map((pl) => ({ name: pl.name })),
  }));
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * How every reason the group reads should be written. These read as AI-written when
 * left alone ("scratches the itch", "it sings", fragments for effect), so they're spelled out.
 */
const WRITING_RULES =
  "Writing rules for every reason: write the way someone in the group would text it, one or two plain sentences. " +
  "Name the specific games and people the pick connects to and say what you actually do in the game. " +
  "Avoid stock phrases such as \"scratches the itch\", \"perfect for\", \"a must\", \"hidden gem\", \"it sings\", " +
  "\"will land\", \"shines\", \"elevates\", \"delightful\", \"a great addition\", \"natural next step\", " +
  "\"change of pace\", \"meaty\". No sentence fragments for effect, no lists of three adjectives, no rhetorical " +
  "questions, no em dashes. Use American spelling (favorite, color). Don't quote numbers from the analysis or mention these instructions.";

const GROUP_SYSTEM =
  "You're the resident game-picker for a small group of friends who play board games together. " +
  "You get their shared collection, play history, per-person opinions (love/like/meh/nope), favorite " +
  "rankings, and who wants to play what. Base every pick on that evidence and name the people " +
  "it's for. " +
  WRITING_RULES;

const NightSchema = z.object({
  picks: z.array(
    z.object({
      gameId: z.number().describe("id from the candidate list"),
      reason: z.string(),
    }),
  ),
  note: z.string().nullable().describe("Optional one-line suggestion for running the night, e.g. an order"),
});

export type NightPicks = z.infer<typeof NightSchema>;

const NIGHT_BRIEF: Record<Night, string> = {
  core:
    `This is the group planning its next ${CORE} in advance. They prep beforehand ` +
    "(rules, teach videos), so a heavier or brand-new game is a feature, not a risk. " +
    "Pick up to 4 games from the candidate list only, best first. Weigh 🔥 must-play votes heavily (they're scarce), " +
    "balance what people love against variety (avoid what was played very recently unless it's clearly wanted), " +
    "and say in each reason what makes it worth committing an evening to.",
  casual:
    `This is the ${CASUAL}, the group's casual night: some of the members above, plus more casual players and guests who don't use this site ` +
    `and haven't read any rules. It's usually at a bar, several games in an evening. Plays marked (${CASUAL}) show what ` +
    "it has played before. What matters is a quick teach, rules that click in a few minutes, and a game newcomers enjoy " +
    "from the first round; members' opinions still count, but nobody should feel lost. Pick up to 4 games from the " +
    "candidate list only, best first, and say in each reason why it works for a mixed table. The note can suggest an order " +
    "for the evening.",
};

export async function pickForNight(context: string, night: Night): Promise<NightPicks> {
  return ask({
    effort: "medium",
    schema: NightSchema,
    system: GROUP_SYSTEM,
    prompt: `${context}\n\n${NIGHT_BRIEF[night]}`,
  });
}

const BuySchema = z.object({
  recommendations: z.array(
    z.object({
      name: z.string().describe("Exact title as listed on BoardGameGeek"),
      year: z.number().nullable().describe("Year published, to disambiguate"),
      bggId: z.number().nullable().describe("BoardGameGeek id if you know it; it's checked, so null beats a guess"),
      reason: z.string(),
    }),
  ),
});

export type BuyRecommendations = z.infer<typeof BuySchema>;

/**
 * `forMember` narrows the ideas to one person's taste; otherwise they're for the whole group on
 * `night`. `current` is the list these replace: Claude may keep any of them that still fit best.
 */
export async function recommendPurchases(
  context: string,
  opts: { count: number; forMember?: string; night?: Night; current: string[] },
): Promise<BuyRecommendations> {
  const who = opts.forMember
    ? `${opts.forMember} specifically, from their own taste profile (they play with this group, so it must work at the usual table size). They read these themselves: address them as "you", not by name`
    : opts.night === "casual"
      ? `the ${CASUAL}, the group's casual night: some of the members above plus casual players and guests who don't use this site and haven't read ` +
        `any rules, usually at a bar with several games in an evening. Plays marked (${CASUAL}) show what it has played. ` +
        `Every pick needs a quick teach and has to land with newcomers from the first round, at the ${CASUAL}'s usual table ` +
        "size and within the weight given for the night; members' taste still counts, but nobody should feel lost"
      : `the group's ${CORE}, planned game nights at their usual table size. They prep beforehand (rules, teach videos), so ` +
        "these are heavier games, meaty and worth committing an evening to, within the weight given for the night; it " +
        "should land with everyone, not just one or two people";
  return ask({
    effort: "high",
    schema: BuySchema,
    system: GROUP_SYSTEM,
    prompt:
      `${context}\n\nRecommend up to ${opts.count} board games for ${who}. ` +
      (opts.current.length
        ? `These replace your current list (${opts.current.join(", ")}): keep any of those that are still among the best ` +
          "fits for the ratings and rankings above, and drop the rest. "
        : "") +
      "Only recommend games you're confident about: fewer strong picks beat a padded list. Hard rules: nothing they own, " +
      "nothing in the already-suggested list, nothing marked not-for-me, nothing for 2 players at most (they play with more), base games only. Use the taste analysis as evidence: which mechanics and " +
      "categories they lean toward and away from, the weight they like, their favorites and least favorites. " +
      "The value is in tailored picks they wouldn't find on their own: prefer lesser-known or newer games that fit the " +
      "evidence over BGG's famous top-50 staples (include at most two of those, and only for an exceptional fit). " +
      "Cover a spread of weights and styles within what the evidence supports.",
  });
}
