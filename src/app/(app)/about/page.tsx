import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CASUAL_NIGHT, CLAUDE, CLAUDE_IDEAS_PER_DAY, NIGHT_NAMES } from "@/config";
import { MUST_PLAY_LIMIT, SENTIMENTS } from "@/db/enums";
import { PageHeader, Panel, TextLink } from "@/components/ui";
import { MIN_EVIDENCE } from "@/lib/recommend";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { inSentence } from "@/lib/text";
import { loadSettings } from "@/lib/settings-store";
import { HEAVY_WEIGHT, TIER_LABEL } from "@/lib/tier";

export const metadata: Metadata = { title: "How it works" };

// The two lists by their names, for use mid-sentence
const heavy = inSentence(TIER_LABEL.heavy);
const light = inSentence(TIER_LABEL.light);

const SECTIONS = [
  ["votes", "Ratings and votes"],
  ["rankings", "Rankings"],
  ["replay", "Replay this or that"],
  ["discover", "Discover's percentages"],
  ["plan", "The planner"],
  ["online", "Playing online"],
  ["data", "Where the data comes from"],
] as const;

/** What every number on the site means and where it comes from, in one place. */
export default async function AboutPage() {
  await loadSettings();
  // The nights by the names this group gives them, for use mid-sentence
  const core = inSentence(NIGHT_NAMES.core);
  const casual = inSentence(NIGHT_NAMES.casual);
  return (
    <>
      <PageHeader title="How it works" />
      <div className="grid max-w-5xl gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-10 lg:self-start">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm lg:flex-col">
            {SECTIONS.map(([id, title]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-accent underline-offset-4 hover:underline">
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-2xl space-y-12 text-sm leading-relaxed">
          <Part id="votes" title="Ratings and votes">
            <p>Each game has three things you can set, from its page or from Rankings → Rate games. They answer different questions.</p>
            <Facts
              rows={[
                [
                  "Rating",
                  <>
                    How much you like it: {SENTIMENTS.map((s) => `${SENTIMENT_LABEL[s].emoji} ${SENTIMENT_LABEL[s].label}`).join(", ")}. Ratings
                    and rankings are what your taste is worked out from.
                  </>,
                ],
                [
                  "Want to play",
                  <>
                    You&apos;d like it on the table soon, whether you&apos;ve played it or not. It&apos;s the &ldquo;N want to play&rdquo; on the
                    dashboard and shelf, and it clears once you play the game, so the counts are about what people want next. Tick it again if you
                    still want to.
                  </>,
                ],
                [
                  "🔥 Must play",
                  <>
                    The few games you really want next. You hold {MUST_PLAY_LIMIT} at a time, and a vote comes back once you play its game. One
                    person&apos;s must-play counts for more than one person wanting to play it.
                  </>,
                ],
              ]}
            />
            <p>
              Only a play dated on or after a vote clears it. If an old event is imported from Discord later, votes you cast since then stay put.
            </p>
          </Part>

          <Part id="rankings" title="Rankings">
            <p>
              You keep two rankings, so games are only compared with their own kind: <strong>{TIER_LABEL.heavy}</strong>, the longer,
              heavier ones (BGG weight {HEAVY_WEIGHT} and up), and <strong>{TIER_LABEL.light}</strong>, everything lighter.
              {CASUAL_NIGHT && ` Which kind of event a game was played at doesn’t matter: a game played at ${casual} that’s heavy enough is still one of the ${heavy}.`} A
              game in the wrong list can be moved from its page, for everyone.
            </p>
            <p>
              Each ranking is every game of that kind you&apos;ve played, best first. A new game is placed with a few &ldquo;which would you
              rather play?&rdquo; questions, each halving the part of your list it could go in. Drag to adjust.
            </p>
            <p>
              The group list&apos;s <strong>Beats</strong> column: for each person who ranked a game, the share of their other games it&apos;s
              ranked above, averaged across them. 100% is the top of every list, 50% the middle, 0% the bottom. A 5-game list and a 20-game list
              count the same.
            </p>
            <p>
              One imaginary 50% vote is added to every game, so a game few people have ranked sits nearer the middle. One person&apos;s #1, and
              nobody else&apos;s, comes out at 75%.
            </p>
            <p>
              Everything that uses rankings (the group lists, the planner, Discover&apos;s percentages{CLAUDE && ", Claude"}) uses a game&apos;s place in its
              own list. Love it / Like it ratings are a single scale across both.
            </p>
          </Part>

          <Part id="replay" title="Replay this or that">
            <p>
              <TextLink href="/rankings/replay">Replay this or that</TextLink> ranks everything you&apos;ve played again from scratch, for when
              your tastes have moved on. Your current list stays hidden so it doesn&apos;t sway your answers, and which game is on the left is
              random.
            </p>
            <p>
              Every answer counts toward the result (a Bradley–Terry model), so one odd pick is outvoted by the rest, unlike the quick placing
              above where each answer is final. Each question is the pair it&apos;s least sure about. It asks about n × log₂ n questions: 64 for
              16 games. You can stop once every game has come up twice.
            </p>
            <p>Answers are kept in your browser until you save. Saving replaces your whole list, drag-and-drop changes included.</p>
          </Part>

          <Part id="discover" title="Discover's percentages">
            <p>
              A percentage is the chance someone would rank a game above their usual game, meaning in the top half of what they&apos;ve rated.
              50% means no idea either way.
            </p>
            <p>
              It comes from the mechanics, categories and weight they tend to rate highly, plus BGG&apos;s rating. It&apos;s checked against games
              they&apos;ve already rated: each one is predicted as if it were new, and the percentages are tuned so that on those games a 70% came
              true about 70% of the time. Someone with only a few ratings borrows from the whole group&apos;s, and with little to go on it stays
              near 50%.
            </p>
            <Facts
              rows={[
                ["Who counts", `People who've rated or ranked ${MIN_EVIDENCE} games. With fewer, the guesses were no better than a coin flip.`],
                ["▲ / ▼", "They've already rated or ranked it, above or below their average. It counts by how far: a love near 90%, a game right on their average 50%."],
                ["Group number", "The average of everyone's percentages, the numbers along the bottom of each card."],
                ["2-player games", "Games for 2 players at most are hidden unless you switch on Include 2-player games."],
                ["Want it / Not for me", "Want it is a vote for the buy list. Not for me stops the game being suggested to you."],
              ]}
            />
            {CLAUDE && (
              <p>
                <strong>Claude&apos;s picks</strong> are Claude&apos;s suggestions from a summary of everyone&apos;s taste. Each one is checked on BGG
                and given a percentage the same way, and only the most likely hits are kept: up to 8 for the group and 6 for you, each at 60% or
                better. Asking again replaces the list using everyone&apos;s latest ratings and rankings, so a good pick can come back; one
                someone wants stays on the buy list. Each person can ask {CLAUDE_IDEAS_PER_DAY} times a day.
              </p>
            )}
          </Part>

          <Part id="plan" title="The planner">
            <p>
              An event&apos;s recommendations (Plan, then the event) score the shelf from what the people coming have said, after leaving out games that don&apos;t fit the player
              count, time or weight (and, if ticked, that nobody coming owns). Points for each person coming:
            </p>
            <Facts
              rows={[
                [`${SENTIMENT_LABEL.love.emoji} Love it / ${SENTIMENT_LABEL.like.emoji} Like it`, "+3 / +1.5"],
                [`${SENTIMENT_LABEL.meh.emoji} Meh / ${SENTIMENT_LABEL.nope.emoji} Not for me`, "−1 / −4"],
                ["Want to play", "+2"],
                ["🔥 Must play", "+4"],
                ["Hasn't rated or ranked it", "−2 to +2 from their taste: the chance they'd like it, as on Discover"],
              ]}
            />
            <p>Then, once per game:</p>
            <Facts
              rows={[
                ["Rankings", "Up to +3 at the top of the lists of the people coming, −3 at the bottom, 0 in the middle or unranked"],
                ["Best at this player count", "+1.5 (BGG voters)"],
                ["Never played together", `+2 if nobody coming has played it with the group, else +1${CASUAL_NIGHT ? ` (always +1 at ${casual})` : ""}`],
                ["Played in the last 2 weeks", "−2 (2–4 weeks: −1)"],
                ["Not played in 4 months", "+0.5"],
                ...(CASUAL_NIGHT
                  ? ([
                      [`Played 3+ times at ${casual}`, `+1, when planning the ${casual}`],
                      ["Nobody coming has played it", `−1.5, when planning the ${casual}: someone has to teach it`],
                    ] as [string, string][])
                  : []),
              ]}
            />
            <p>
              The labels on each game (&ldquo;Sam loves it&rdquo;, &ldquo;Best at 4&rdquo;, &ldquo;Suits Sam&apos;s taste&rdquo;) say which of these
              apply. The taste guess is what lets a game nobody has played yet compete with the group&apos;s favorites; tick &ldquo;Only games
              nobody coming has played with the group&rdquo; to see just those. Legacy games (BGG&apos;s Legacy Game mechanic, like Gloomhaven or Pandemic
              Legacy) are left out, since they&apos;re a run of sessions rather than a pick for one.
            </p>
            <p>
              Each event&apos;s recommendations start &ldquo;Who&apos;s coming?&rdquo; from who&apos;s going: members by name, and everyone else as
              others coming. Maybes aren&apos;t counted. Until anyone has answered, it starts with every member. Change it before you pick.{" "}
              {CASUAL_NIGHT ? `At ${core} the game is decided by votes` : "The game is decided by votes"}: everyone taps &ldquo;I&apos;d play
              it&rdquo; on any proposal they would, and anyone locks one in. Votes don&apos;t add points to the recommendations.
            </p>
            {CASUAL_NIGHT && (
              <p>
                Planning <strong>{NIGHT_NAMES.casual}</strong> is different: &ldquo;never played&rdquo; and how recently it was played count only{" "}
                {casual} plays, and it starts with games up to weight 2.5, 2 hours, and two seats for people who aren&apos;t members.
                Plans belong to their event: a play at {casual} doesn&apos;t tick off a plan for {core}.
              </p>
            )}
          </Part>

          {CASUAL_NIGHT && (
            <Part id="nights" title={`${NIGHT_NAMES.core} and ${casual}`}>
              <p>
                {NIGHT_NAMES.core} and {casual} log plays in their own Discord channels. Both are read, and every play says which kind of event it was.
                Only the group can sign in here; people who only come to {casual} show up as names in the logs, and if one of them joins later,
                their history is already waiting.
              </p>
              <Facts
                rows={[
                  ["Counts both kinds", `What you've played (so it's yours to rate and rank), clearing your votes when you play a game, the shelf's play counts${CLAUDE ? `, and what Claude sees (plays at ${casual} are marked)` : ""}.`],
                  ["Home", `Its numbers and charts count both kinds, split by color: green for ${core}, gold for ${casual}. Last event is the last ${core}.`],
                  [
                    "Switches between them",
                    `Plays, Plan, and Discover's group picks. Each Discover tab shows the games for its kind of event, at its usual table size: ${heavy} (weight ${HEAVY_WEIGHT} and up) for ${core}, ${light} for ${casual}, no heavier than 4 in 5 of the games it has played.${CLAUDE ? " Each has its own list of Claude's picks." : ""}`,
                  ],
                ]}
              />
            </Part>
          )}

          <Part id="online" title="Playing online">
            <p>
              <TextLink href="/online">Online</TextLink> lists our games that Board Game Arena has: ones we&apos;ve played together (favorites
              first), shelf games we&apos;ve never played, and wishlist or buy-list games nobody owns, to try before buying. <strong>Recommended on
              BGA</strong> scores BGA games nobody owns or has played with the group the same way as{" "}
              <a href="#discover" className="text-accent underline-offset-4 hover:underline">Discover&apos;s percentages</a>, for any player count,
              since two people can play online.
            </p>
            <Facts
              rows={[
                ["Up for it on BGA", "You'd play it there with the group. It's separate from want to play, and nothing clears it: plays on BGA aren't logged here."],
                ["BGA name", "Set in Settings so the others can find you on BGA."],
                ["Premium", "Some BGA games need Premium, but only for whoever opens the table. Tick it in Settings if you have it, and those games say you can host."],
              ]}
            />
          </Part>

          <Part id="data" title="Where the data comes from">
            <Facts
              rows={[
                [
                  "Plays",
                  `Logged on the event's page once it starts, or on Plays (and posted to that kind's Discord channel), or written by hand in ${CASUAL_NIGHT ? "either channel" : "the channel"}. The sync reads hand-written posts every night and when anyone taps Sync from Discord, and picks up edits to posts for two weeks. A play logged both here and in Discord is only counted once.`,
                ],
                ["Shelf", "Everyone's BGG collection: from the BGG username in Settings, refreshed nightly, or a CSV export uploaded there."],
                ["Game details", "Player counts, best player counts, weight, mechanics and ratings come from BGG."],
                ["Board Game Arena", "Which games are on BGA, matched to BGG by id, from BGA's public game list every night. BGG details for BGA's 400 most played games are fetched a batch a night so they can be recommended. BGA has no way to read anyone's plays without signing in."],
                ...(CLAUDE
                  ? [
                      [
                        "What Claude sees",
                        "Names, recent plays and who played them, everyone's ratings, votes and rankings, the shared shelf, BGG wishlists and the taste summary. Nothing from Discord accounts. It's only asked when someone taps a Claude button.",
                      ] as [string, string],
                    ]
                  : []),
              ]}
            />
          </Part>
        </div>
      </div>
    </>
  );
}

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 space-y-3">
      <h2 id={`${id}-title`} className="font-wide text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <Panel>
      <dl className="divide-y divide-line">
        {rows.map(([term, detail], i) => (
          <div key={i} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <dt className="font-semibold">{term}</dt>
            <dd className="text-slate">{detail}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
