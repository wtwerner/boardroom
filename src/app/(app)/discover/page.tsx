import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { CASUAL_NIGHT, CLAUDE, NIGHT_NAMES } from "@/config";
import type { MeepleColor, Night } from "@/db/enums";
import { nightParam } from "@/components/night-switch";
import { Empty, GameCover, Meeple, PageHeader, Section, Skeleton, TextLink, playerRange, playtime } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { hasAnthropicKey } from "@/lib/ai";
import { hasBggToken } from "@/lib/bgg";
import { bgaGameUrl } from "@/lib/bga";
import { getBgaByBggId } from "@/lib/queries";
import { type Candidate, MIN_EVIDENCE, type MemberFit, getRecommendations } from "@/lib/recommend";
import { describeReason } from "@/lib/taste";
import { inSentence } from "@/lib/text";
import { HEAVY_WEIGHT, TIER_LABEL } from "@/lib/tier";
import { Sparkles } from "lucide-react";
import { AddSuggestionForm, CollapsiblePicks, DiscoverTabs, FindIdeasButton, LoadCatalogButton, PickActions, TakeOffBuyList } from "./discover-controls";

export const metadata: Metadata = { title: "Discover" };
// Finding ideas asks Claude, then checks each one on BGG
export const maxDuration = 300;

type Member = { id: string; name: string; color: MeepleColor | null };

export default function DiscoverPage(props: PageProps<"/discover">) {
  return (
    <>
      <PageHeader title="Discover" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Discover searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Discover({ searchParams }: { searchParams: PageProps<"/discover">["searchParams"] }) {
  const me = await requireUser();
  const params = await searchParams;
  // Group taste has its own page now
  if (params.view === "taste") redirect("/people/taste");
  const twoPlayer = params.two === "1";
  const [rec, bga] = await Promise.all([getRecommendations(me.id, me.playerId, { twoPlayer }), getBgaByBggId()]);
  const members: Member[] = rec.members.map((m) => ({ id: m.id, name: m.name, color: m.color }));
  const canFind = hasAnthropicKey() && hasBggToken();
  const evidenceCount = Object.values(rec.insights.evidence).reduce((a, b) => a + b, 0);
  const cardProps = { members, meId: me.id, scoredIds: rec.scoredMemberIds, bga };

  const forNight = (night: Night) => {
    const n = rec.nights[night];
    // With two kinds of night, each is named; with one, it's just the group's
    const forWhom = CASUAL_NIGHT ? `the ${inSentence(NIGHT_NAMES[night])}` : "the group";
    // "a 4-player table, weight 2.75 and up", or "the casual night's usual 6-player table, up to weight 2.3"
    const table =
      night === "casual"
        ? `${forWhom}'s usual ${n.tableSize}-player table, ${n.maxWeight !== null && n.maxWeight < HEAVY_WEIGHT ? `up to weight ${n.maxWeight}` : `under weight ${HEAVY_WEIGHT}`}`
        : `a ${n.tableSize}-player table, weight ${HEAVY_WEIGHT} and up`;
    return (
      <>
        {CLAUDE && (
          <ClaudeSection
            title={`Claude's picks for ${forWhom}`}
            intro={
              night === "casual"
                ? `Quick to teach and good with guests, for ${table}. Checked against each member's profile from ${evidenceCount} ratings and rankings.`
                : `${TIER_LABEL.heavy} for ${table}, tailored to everyone's taste from ${evidenceCount} ratings and rankings.`
            }
            picks={n.claude}
            updatedAt={n.claudeUpdatedAt}
            scope="group"
            night={night}
            canAsk={canFind}
            {...cardProps}
            mode="group"
          />
        )}

        {rec.group.buyList.length > 0 && (
          <Section title="Buy list" action={<span className="text-xs text-slate">most wanted first</span>}>
            <PickGrid picks={rec.group.buyList} {...cardProps} mode="group" buyList />
          </Section>
        )}

        <Section title="On the shelf">
          <p className="mb-4 max-w-2xl text-sm text-slate">
            Games someone owns now that suit {table}, best bets first.{" "}
            <TextLink href="/plan">Plan</TextLink> picks for a particular event.
          </p>
          {n.shelf.length ? (
            <PickGrid picks={n.shelf} {...cardProps} mode="group" owned />
          ) : (
            <Empty>Nothing on the shelf suits {table} yet.</Empty>
          )}
        </Section>

        <Section title={`More that fit ${forWhom}`}>
          <p className="mb-4 max-w-2xl text-sm text-slate">
            Ideas to buy: games on people&apos;s BGG wishlists and BGG&apos;s trending and well-loved lists, none of which anyone owns. Best bets
            first for {table}, by every member&apos;s average chance of liking it.
          </p>
          <AddSuggestionForm />
          {n.more.length ? (
            <PickGrid picks={n.more} {...cardProps} mode="group" className="mt-4" />
          ) : (
            <Empty className="mt-4">
              Nothing yet. The nightly sync fills this from BGG.
              {hasBggToken() && <LoadCatalogButton />}
            </Empty>
          )}
        </Section>

        <HowScored mode="group" />
      </>
    );
  };

  // Everything comes from the same recommendations, so both views and both nights are sent and switch in the browser
  return (
    <DiscoverTabs
      initial={params.view === "you" ? "you" : "group"}
      initialNight={(CASUAL_NIGHT && nightParam(params.night)) || "core"}
      twoPlayer={twoPlayer}
      nightNames={NIGHT_NAMES}
      group={CASUAL_NIGHT ? { core: forNight("core"), casual: forNight("casual") } : { core: forNight("core") }}
      you={
        !rec.me.enoughData ? (
          <Empty>
            Rate or rank at least {MIN_EVIDENCE} games and this fills with picks for you. <TextLink href="/rankings/rate">Rate games</TextLink>
          </Empty>
        ) : (
          <>
            {CLAUDE && (
              <ClaudeSection
                title="Claude's picks for you"
                intro="Tailored to your own rankings and ratings: games you might love that the group doesn't own."
                picks={rec.me.claude}
                updatedAt={rec.me.claudeUpdatedAt}
                scope="me"
                canAsk={canFind}
                {...cardProps}
                mode="me"
              />
            )}
            <Section title="More that fit you">
              <PickGrid picks={rec.me.more} {...cardProps} mode="me" />
            </Section>
            <Section title="On the shelf, not played by you">
              <PickGrid picks={rec.me.shelf} {...cardProps} mode="me" owned />
            </Section>
            <HowScored mode="me" />
          </>
        )
      }
    />
  );
}

function ClaudeSection({
  title,
  intro,
  picks,
  updatedAt,
  scope,
  night,
  canAsk,
  ...card
}: CardProps & { title: string; intro: string; picks: Candidate[]; updatedAt: Date | null; scope: "group" | "me"; night?: Night; canAsk: boolean }) {
  // Both nights' sections are on the page at once
  const headingId = scope === "group" ? `claude-${night ?? "core"}` : "claude-me";
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-ink/70 bg-card p-4 shadow-token sm:p-5">
      <CollapsiblePicks
        storageKey={`claude-picks-hidden-${scope}${night === "casual" ? "-casual" : ""}`}
        batch={updatedAt?.toISOString() ?? ""}
        count={canAsk ? picks.length : 0}
        title={
          <h2 id={headingId} className="font-wide flex items-center gap-2 text-lg">
            <Sparkles className="size-4 text-accent" /> {title}
          </h2>
        }
        intro={
          <p className="mt-1 text-sm text-slate">
            {intro}
            {updatedAt && ` Last asked ${timeAgo(updatedAt)}.`}
          </p>
        }
        actions={canAsk && <FindIdeasButton scope={scope} night={night} label={picks.length ? "New picks" : "Get picks"} />}
      >
        <div className="mt-4">
          {!canAsk ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-slate">
              Claude&apos;s picks need an Anthropic API key on the server (<code className="text-xs">ANTHROPIC_API_KEY</code>). Everything else on this page
              works without it.
            </p>
          ) : picks.length ? (
            <PickGrid picks={picks} {...card} />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-slate">
              No picks yet. Claude reads the taste analysis and suggests games you may not have heard of; each one is checked on BGG.
            </p>
          )}
        </div>
      </CollapsiblePicks>
    </section>
  );
}

type CardProps = { members: Member[]; meId: string; scoredIds: string[]; mode: "group" | "me"; bga: Awaited<ReturnType<typeof getBgaByBggId>> };

function PickGrid({ picks, className, owned, buyList, ...card }: CardProps & { picks: Candidate[]; className?: string; owned?: boolean; buyList?: boolean }) {
  return (
    <ul className={clsx("grid gap-3 xl:grid-cols-2", className)}>
      {picks.map((c) => (
        <PickCard key={c.game.id} c={c} owned={owned} buyList={buyList} {...card} />
      ))}
    </ul>
  );
}

function PickCard({ c, members, meId, scoredIds, mode, owned, buyList, bga }: CardProps & { c: Candidate; owned?: boolean; buyList?: boolean }) {
  const g = c.game;
  const onBga = bga.get(g.id);
  const name = (id: string) => (id === meId ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
  const names = (ids: string[]) => ids.map(name).join(" & ");
  const mine = c.fits[meId];

  // Why: for the group, what the keenest member likes and what the least keen one doesn't; for you, your own reasons
  const reasons =
    mode === "me"
      ? (c.fits[meId]?.reasons ?? []).map((r) => ({ tone: r.tone, text: describeReason(r, null) }))
      : (() => {
          const ranked = scoredIds.map((id) => ({ id, fit: c.fits[id] })).sort((a, b) => b.fit.chance - a.fit.chance);
          const top = ranked[0];
          const low = ranked[ranked.length - 1];
          return [
            ...(top?.fit.reasons.filter((r) => r.tone === "good").slice(0, 2).map((r) => ({ tone: r.tone, text: describeReason(r, name(top.id) === "You" ? null : name(top.id)) })) ?? []),
            ...(low && low !== top
              ? low.fit.reasons.filter((r) => r.tone === "bad").slice(0, 1).map((r) => ({ tone: r.tone, text: describeReason(r, name(low.id) === "You" ? null : name(low.id)) }))
              : []),
          ];
        })();

  const sources = c.sources.map((s) => {
    switch (s.kind) {
      case "claude":
        return s.forUserId ? `Claude's pick for ${s.forUserId === meId ? "you" : name(s.forUserId)}` : "Claude's pick";
      case "member":
        return `Added by ${s.name ?? "someone"}`;
      case "wishlist":
        return `On ${names(s.userIds)}'s wishlist`;
      case "hot":
        return "Trending on BGG";
      case "top":
        return g.bggRank ? `BGG #${g.bggRank}` : "Well loved on BGG";
    }
  });
  if (owned && c.ownerIds.length) sources.unshift(`On the shelf: ${names(c.ownerIds)}${c.unplayed ? ", never played together" : ""}`);
  const facts = [playerRange(g.minPlayers, g.maxPlayers), playtime(g.minPlaytime, g.maxPlaytime), g.weight ? `weight ${g.weight.toFixed(1)}` : null, g.bggRating ? `BGG ${g.bggRating.toFixed(1)}` : null];

  return (
    <li className="flex gap-3 rounded-xl border border-line bg-card p-3">
      <GameCover src={g.thumbnail} image={g.image} name={g.name} size="lg" className="size-16! sm:size-24!" sizes="96px" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/games/${g.id}`} className="font-semibold hover:underline">
              {g.name}
            </Link>
            {g.year && <span className="ml-1.5 text-xs text-slate">{g.year}</span>}
            <p className="text-xs text-slate">
              {facts.filter(Boolean).join(", ")}
              {onBga && (
                <>
                  {", "}
                  <a href={bgaGameUrl(onBga.slug)} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
                    {owned ? "on BGA" : "try it on BGA"}
                  </a>
                </>
              )}
            </p>
          </div>
          {mode === "group" && c.group.of > 0 && (
            <div className="shrink-0 text-right" title="The average of everyone's chances, shown under the card">
              <div className="font-display tabular text-2xl leading-none">{percent(c.group.chance)}</div>
              <div className="text-[0.7rem] text-slate">{c.group.of > 1 ? "average chance" : "chance of a hit"}</div>
            </div>
          )}
          {mode === "me" && mine && scoredIds.includes(meId) && (
            <div className="shrink-0 text-right" title={mine.known ? undefined : "Chance you'd rank it above your usual game"}>
              {mine.known ? (
                <div className="text-xs text-slate">You rate it {said(mine, "your")}</div>
              ) : (
                <>
                  <div className="font-display tabular text-2xl leading-none">{percent(mine.chance)}</div>
                  <div className="text-[0.7rem] text-slate">chance you&apos;d like it</div>
                </>
              )}
            </div>
          )}
        </div>

        {sources.length > 0 && <p className="mt-1 text-xs text-accent">{[...new Set(sources)].join(", ")}</p>}
        {c.suggestion?.reason && <p className="mt-1.5 text-sm">{c.suggestion.reason}</p>}

        {reasons.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {reasons.map((r) => (
              <li key={r.text} className={clsx("rounded-full px-2 py-0.5 text-xs text-ink", r.tone === "good" ? "bg-meeple-green/15" : "bg-meeple-red/12")}>
                {r.text}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          {mode === "group" && scoredIds.length > 1 ? (
            <ul aria-label="Fit for each member" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {members.map((m) => {
                const counted = scoredIds.includes(m.id);
                return (
                  <li
                    key={m.id}
                    title={
                      !counted
                        ? `${m.name} hasn't rated ${MIN_EVIDENCE} games yet, so doesn't count`
                        : c.fits[m.id].known
                          ? `${m.name} already rates it ${said(c.fits[m.id], "their")}`
                          : `${m.name}: ${percent(c.fits[m.id].chance)} chance they'd rank it above their usual game`
                    }
                    className={clsx("inline-flex items-center gap-1", !counted && "opacity-40")}
                  >
                    <Meeple color={m.color} className="size-3.5" />
                    <span className="tabular">{!counted ? "?" : c.fits[m.id].known ? KNOWN_MARK[leaning(c.fits[m.id].chance)] : percent(c.fits[m.id].chance)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <span />
          )}
          {!owned && (
            <span className="flex items-center gap-2">
              {c.suggestion && c.suggestion.score !== 0 && <span className="tabular text-xs text-slate">{c.suggestion.score} {Math.abs(c.suggestion.score) === 1 ? "vote" : "votes"}</span>}
              <PickActions gameId={g.id} wanted={c.suggestion?.myVote === 1} notForMe={c.vetoedBy.includes(meId)} />
              {buyList && c.suggestion && <TakeOffBuyList suggestionId={c.suggestion.id} name={g.name} />}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

const percent = (p: number) => `${Math.round(p * 100)}%`;
/** Which side of their average a rated game sits: a few points either way is still "about average" */
const leaning = (chance: number) => (chance >= 0.6 ? "above" : chance <= 0.4 ? "below" : "about");
const KNOWN_MARK = { above: "▲", below: "▼", about: "–" } as const;
const said = (f: MemberFit, whose: "your" | "their") => {
  const side = leaning(f.chance);
  return side === "about" ? "about average" : `${side} ${whose} average (${percent(f.chance)})`;
};

/** What the percentages on Discover mean, in plain words. */
function HowScored({ mode }: { mode: "group" | "me" }) {
  return (
    <details className="max-w-2xl text-sm text-slate">
      <summary className="cursor-pointer font-medium text-ink">How the percentages work</summary>
      <div className="mt-2 space-y-2">
        <p>
          A percentage is the chance someone would rank a game above their usual game, meaning in the top half of what they&apos;ve rated. It
          comes from the mechanics, categories and weight they tend to rate highly, plus BGG&apos;s rating, and it&apos;s checked against games
          they&apos;ve already rated: each one is predicted as if it were new, and the percentages are tuned so that, on those games, a 70% came
          true about 70% of the time. With little to go on, it stays near 50%.
        </p>
        {mode === "group" ? (
          <p>
            The big number is the average of everyone&apos;s chances, the numbers along the bottom of the card. ▲ or ▼ means that person has already
            rated or ranked it, above or below their average. What they said counts by how far: a love near 90%, a game right on their average
            50%. People count once they&apos;ve rated or ranked{" "}
            {MIN_EVIDENCE} games.
          </p>
        ) : (
          <p>Games you&apos;ve already rated or ranked show what you said instead of a guess.</p>
        )}
        <p>
          <TextLink href="/about#discover">More in How it works</TextLink>
        </p>
      </div>
    </details>
  );
}

function timeAgo(d: Date) {
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
