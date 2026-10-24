import Link from "next/link";
import { Suspense } from "react";
import clsx from "clsx";
import { CASUAL_NIGHT, NIGHT_NAMES } from "@/config";
import { AttendanceBars, MonthColumns } from "@/components/charts";
import type { MeepleColor, Tier } from "@/db/enums";
import { NightRow } from "@/components/night-row";
import { type NightDetail, getNightsByDate, getUpcomingNights } from "@/lib/events";
import { Chips, alike, whoLikes } from "@/components/taste";
import { Avatar, Empty, GameCover, Meeple, PlayerChip, Panel, ProgressBar, Section, Skeleton, TextLink, buttonClass, formatDate } from "@/components/ui";
import { localDate } from "@/lib/nights";
import { requireUser } from "@/lib/session";
import {
  getAttendance,
  getGroupRanking,
  getHeadlineStats,
  getLastNight,
  getMembers,
  getMostPlayed,
  getNewMembers,
  getNewToRank,
  getPlaysByMonth,
  getReviewQueue,
  getSetupStatus,
  getWantToPlay,
  type PlayRow,
  type SetupStatus,
} from "@/lib/queries";
import { MIN_EVIDENCE, type TasteInsights, getShelfOfShame, getTasteInsights } from "@/lib/recommend";
import { TIER_LABEL, TIER_TAG } from "@/lib/tier";
import { listNames } from "@/lib/discord-components";
import { setupProgress, setupSteps } from "@/lib/setup";
import { tierHref } from "./rankings/tabs";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const me = await requireUser();
  const [stats, lastNight, mostPlayed, attendance, months, group, shame, wanted, review, setup, members, plans, newMembers, taste, toRank] = await Promise.all([
    getHeadlineStats(),
    getLastNight(),
    getMostPlayed(8),
    getAttendance(),
    getPlaysByMonth(),
    Promise.all([getGroupRanking("heavy", 5), getGroupRanking("light", 3)]),
    getShelfOfShame(10),
    getWantToPlay(6),
    getReviewQueue(),
    getSetupStatus(me),
    getMembers(),
    getUpcomingNights(),
    getNewMembers(),
    getTasteInsights(),
    getNewToRank(me.id, me.playerId),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const lastNightId = lastNight && (await getNightsByDate([{ night: "core", date: lastNight.date }])).get(`core:${lastNight.date}`)?.id;

  if (stats.all.plays === 0) return <FirstRun name={me.name} />;

  const reviewCount = review.reduce((n, r) => n + r.count, 0);

  return (
    <div className="space-y-10">
      <SetupNudge name={me.name} status={setup} toRank={toRank} />
      <NewMembers members={newMembers.filter((m) => m.id !== me.id)} />
      {plans.length > 0 && <UpNext nights={plans.slice(0, 3)} members={members} />}

      {lastNight && (
        <section>
          <p className="text-sm text-slate">
            Last event was {formatDate(lastNight.date, { weekday: "long", month: "long", day: "numeric" })}
            {lastNightId && (
              <>
                {" · "}
                <TextLink href={`/events/${lastNightId}`}>See the event</TextLink>
              </>
            )}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex -space-x-6">
              {lastNight.plays.slice(0, 4).map((p, i) => (
                <GameCover key={p.id} src={p.thumbnail} image={p.image} name={p.name} size="lg" className={i > 0 ? "hidden sm:block" : undefined} />
              ))}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">
                {lastNight.plays.map((p) => p.name).join(", ")}
              </h1>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {uniqueSeats(lastNight.plays).map((s) => (
                  <PlayerChip key={s.playerId} name={s.name} color={s.color} size="md" />
                ))}
              </div>
              {lastNight.plays[0]?.location && <p className="mt-2 text-sm text-slate">at {lastNight.plays[0].location}</p>}
            </div>
          </div>
        </section>
      )}

      {reviewCount > 0 && (
        <Link href="/plays#review" className="flex items-center justify-between rounded-xl border border-meeple-yellow/60 bg-meeple-yellow/10 px-4 py-3 text-sm">
          <span>
            <strong>{reviewCount}</strong> logged {reviewCount === 1 ? "play needs" : "plays need"} a game match
          </span>
          <span className="font-semibold">Fix them</span>
        </Link>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat label={`Plays in ${stats.year}`} value={stats.thisYear.plays} split={stats.thisYear} />
        <Stat
          label={`Events in ${stats.year}`}
          value={stats.thisYear.coreNights + stats.thisYear.casualNights}
          split={{ core: stats.thisYear.coreNights, casual: stats.thisYear.casualNights }}
        />
        <Stat label="Different games" value={stats.all.games} />
        <Stat label="Plays logged, all time" value={stats.all.plays} split={stats.all} />
      </dl>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Plays per month">
          <MonthColumns data={months} />
        </Section>
        <Section title="Who shows up" action={<span className="text-xs text-slate">events attended</span>}>
          <AttendanceBars
            rows={attendance
              .filter((a) => a.userId || a.nights > 1)
              .slice(0, 8)
              .map((a) => ({ id: a.id, name: a.name, color: a.color, core: a.coreNights, casual: a.casualNights }))}
          />
        </Section>
      </div>

      <Section title="Most played" action={<TextLink href="/plays">All plays</TextLink>}>
        <ul className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-8">
          {mostPlayed.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="group block" title={CASUAL_NIGHT ? `${NIGHT_NAMES.core} ${g.core} · ${NIGHT_NAMES.casual} ${g.casual}` : undefined}>
                <GameCover src={g.thumbnail} image={g.image} name={g.name} size="fluid" sizes="(min-width: 640px) 10vw, 22vw" />
                <span className="mt-1.5 block truncate text-xs font-medium group-hover:underline">{g.name}</span>
                <span className="tabular text-xs text-slate">{g.plays}×</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-10 lg:grid-cols-3">
        <Section title="Group favorites" action={<TextLink href="/rankings">Rank yours</TextLink>}>
          {group.some((list) => list.length) ? (
            <div className="space-y-5">
              {group.map((list, t) =>
                list.length ? (
                  <div key={t}>
                    <h3 className="mb-1.5 text-xs font-medium text-slate">{TIER_LABEL[t === 0 ? "heavy" : "light"]}</h3>
                    <ol className="space-y-2">
                      {list.map((g, i) => (
                        <GameRow
                          key={g.gameId}
                          id={g.gameId}
                          name={g.game.name}
                          thumb={g.game.thumbnail}
                          lead={<span className="font-display w-5 text-accent tabular">{i + 1}</span>}
                          meta={`beats ${g.points}%`}
                        />
                      ))}
                    </ol>
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <Empty>Nobody has ranked their favorites yet.</Empty>
          )}
        </Section>
        <Section title="People want to play" action={<span className="text-xs text-slate">🔥 must play first</span>}>
          {wanted.length ? (
            <ul className="space-y-2">
              {wanted.map((g) => (
                <GameRow
                  key={g.id}
                  id={g.id}
                  name={g.name}
                  thumb={g.thumbnail}
                  meta={[
                    g.mustPlay.length > 0 && `🔥 ${g.mustPlay.map((id) => nameOf.get(id)).join(", ")}`,
                    g.wantToPlay.length > 0 && `${g.wantToPlay.length} want to play`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
              ))}
            </ul>
          ) : (
            <Empty>Mark &ldquo;Want to play&rdquo; or 🔥 Must play on a game to see it here.</Empty>
          )}
        </Section>
        <Section title="Shelf of shame" action={<TextLink href="/shelf?shame=1">All of them</TextLink>}>
          <p className="-mt-1 mb-3 text-xs text-slate">Owned, never played, best bets first.</p>
          {shame.length ? (
            <ul className="space-y-2">
              {shame.map((g) => (
                <GameRow
                  key={g.id}
                  id={g.id}
                  name={g.name}
                  thumb={g.thumbnail}
                  tag={<NightTag tier={g.tier} />}
                  meta={g.group.of ? `${Math.round(g.group.chance * 100)}%` : g.minPlaytime ? `${g.minPlaytime}+ min` : undefined}
                />
              ))}
            </ul>
          ) : (
            <Empty>Nothing on the shelf is waiting: the games the group would likely enjoy have all been played.</Empty>
          )}
        </Section>
      </div>

      <GroupTaste insights={taste.insights} members={members} />
    </div>
  );
}

/** The headline of Group taste: what everyone likes, what splits you, who's alike. The full page is on People. */
function GroupTaste({ insights: i, members }: { insights: TasteInsights; members: Awaited<ReturnType<typeof getMembers>> }) {
  const m = (id: string) => members.find((x) => x.id === id);
  const counted = members.filter((x) => (i.evidence[x.id] ?? 0) >= MIN_EVIDENCE);
  const sub = "mb-2 text-sm font-semibold";
  if (counted.length < 2) {
    return (
      <Section title="Group taste">
        <Empty>
          Group taste needs at least two people with {MIN_EVIDENCE}+ games rated or ranked. <TextLink href="/rankings/rate">Rate games</TextLink>
        </Empty>
      </Section>
    );
  }
  // Closest and furthest apart; pairs come sorted most alike first
  const twins = i.pairs.length > 1 ? [i.pairs[0], i.pairs.at(-1)!] : i.pairs;
  return (
    <Section title="Group taste" action={<TextLink href="/people/taste">See all</TextLink>}>
      <div className="grid gap-8 lg:grid-cols-3">
        <div>
          <h3 className={sub}>Everyone likes</h3>
          <Chips items={i.sharedLikes.slice(0, 5).map((f) => f.label)} tone="good" empty="Nothing everyone agrees on yet." />
        </div>
        <div>
          <h3 className={sub}>Splits the group</h3>
          {i.divisive.length ? (
            <ul className="space-y-2 text-sm">
              {i.divisive.slice(0, 3).map((f) => (
                <li key={f.key}>
                  <span className="font-medium">{f.label}</span>
                  <span className="block text-xs text-slate">{whoLikes(f, (id) => m(id)?.name)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing divisive yet.</Empty>
          )}
        </div>
        <div>
          <h3 className={sub}>Taste twins</h3>
          {twins.length ? (
            <Panel className="divide-y divide-line">
              {twins.map((p) => (
                <div key={`${p.a}${p.b}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Meeple color={m(p.a)?.color ?? null} />
                  <Meeple color={m(p.b)?.color ?? null} className="-ml-2 size-4" />
                  <span className="flex-1">
                    {m(p.a)?.name} &amp; {m(p.b)?.name}
                  </span>
                  <span className="text-slate" title={`Correlation of their ratings: ${p.r.toFixed(2)} over ${p.shared} games in common`}>
                    {alike(p.r)}
                  </span>
                </div>
              ))}
            </Panel>
          ) : (
            <Empty>Pairs need 3 games in common to compare.</Empty>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Recent sign-ups, so the group notices someone new and can look at their shelf. */
function NewMembers({ members }: { members: Awaited<ReturnType<typeof getNewMembers>> }) {
  if (!members.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {members.map((m) => (
        <li key={m.id}>
          <Link href={`/people/${m.id}`} className="flex items-center gap-2.5 rounded-xl border border-meeple-yellow/60 bg-meeple-yellow/10 py-2 pr-4 pl-2 text-sm hover:border-ink/40">
            <Avatar src={m.image} name={m.name} color={m.color} />
            <span>
              <strong>{m.name}</strong> joined {formatDate(localDate(m.joinedAt), { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function uniqueSeats(plays: PlayRow[]) {
  const seen = new Map<number, PlayRow["players"][number]>();
  for (const p of plays)
    for (const s of p.players) {
      if (!seen.has(s.playerId)) seen.set(s.playerId, s);
    }
  return [...seen.values()];
}

function UpNext({ nights, members }: { nights: NightDetail[]; members: { id: string; name: string; color: MeepleColor | null }[] }) {
  const colors = Object.fromEntries(members.map((m) => [m.id, m.color]));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  return (
    <Section title="Coming up" action={<TextLink href="/plan">All events</TextLink>}>
      <ul className="grid gap-3 lg:grid-cols-2">
        {nights.map((n) => (
          <li key={n.id}>
            <NightRow n={n} colors={colors} names={names} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * One line, never the whole checklist: how far through getting set up someone is, with the
 * setup page a tap away. Once they're set up, the games they've played since they last ranked,
 * by name, so a new one is hard to miss.
 */
function SetupNudge({ name, status, toRank }: { name: string; status: SetupStatus; toRank: Awaited<ReturnType<typeof getNewToRank>> }) {
  const progress = setupProgress(setupSteps(status));
  if (!progress.complete) {
    return (
      <Link
        href="/welcome"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-ink/70 bg-card px-4 py-3 shadow-token hover:border-ink"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Finish setting up, {name}</span>
          <span className="block text-sm text-slate">Next: {progress.next?.title.toLowerCase()}</span>
        </span>
        <span className="flex w-full items-center gap-2.5 sm:w-44">
          <ProgressBar done={progress.done} total={progress.total} label="Setup progress" />
          <span className="tabular shrink-0 text-xs text-slate">
            {progress.done} of {progress.total}
          </span>
        </span>
        <span className="text-sm font-semibold">Continue</span>
      </Link>
    );
  }
  if (!toRank.length) return null;

  const [latest] = toRank;
  const one = toRank.length === 1;
  const shown = toRank.slice(0, 3).map((g) => g.name);
  const names = toRank.length > 3 ? `${shown.join(", ")} and ${toRank.length - 3} more` : listNames(shown);
  const unrated = toRank.some((g) => !g.sentiment);
  return (
    <section aria-labelledby="to-rank" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-meeple-yellow/70 bg-meeple-yellow/10 p-4">
      <div className="hidden -space-x-3 sm:flex" aria-hidden>
        {toRank.slice(0, 3).map((g) => (
          <GameCover key={g.id} src={g.thumbnail} name={g.name} size="sm" className="ring-2 ring-card" />
        ))}
      </div>
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <h2 id="to-rank" className="text-sm font-semibold">
          New to rank: {names}
        </h2>
        <p className="text-sm text-slate">
          You played {one ? "it" : "the last one"} on {formatDate(latest.lastPlayed, { weekday: "long", month: "short", day: "numeric" })}. A few
          &ldquo;this or that?&rdquo; questions put {one ? "it" : "them"} in your ranking.
          {unrated && (
            <>
              {" "}
              <TextLink href="/rankings/rate">Rate {one ? "it" : "them"} too</TextLink>
            </>
          )}
        </p>
      </div>
      <Link href={tierHref("/rankings", latest.tier)} className={buttonClass("primary", "w-full sm:w-auto")}>
        Rank {one ? "it" : "them"}
      </Link>
    </section>
  );
}

/** A headline number, with how it splits between the two nights when the group has two */
function Stat({ label, value, split }: { label: string; value: number; split?: { core: number; casual: number } }) {
  return (
    <div className="bg-card px-4 py-4">
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="font-display tabular mt-1 text-3xl">{value}</dd>
      {split && CASUAL_NIGHT && (
        <dd className="tabular mt-1 flex flex-wrap gap-x-2.5 text-xs text-slate">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[2px] bg-night-core" aria-hidden />
            {NIGHT_NAMES.core} {split.core}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[2px] bg-night-casual" aria-hidden />
            {NIGHT_NAMES.casual} {split.casual}
          </span>
        </dd>
      )}
    </div>
  );
}

function GameRow({ id, name, thumb, meta, lead, tag }: { id: number; name: string; thumb: string | null; meta?: string; lead?: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <li>
      <Link href={`/games/${id}`} className="flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-felt-soft">
        {lead}
        <GameCover src={thumb} name={name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {tag}
        {meta && <span className="tabular text-xs text-slate">{meta}</span>}
      </Link>
    </li>
  );
}

/** Which list a game is ranked in, by its weight, colored for the night it suits */
function NightTag({ tier }: { tier: Tier }) {
  if (!CASUAL_NIGHT) return null;
  return (
    <span className={clsx("rounded-full px-1.5 py-px text-[0.65rem] font-medium whitespace-nowrap text-ink", tier === "heavy" ? "bg-night-core/15" : "bg-night-casual/20")}>
      {TIER_TAG[tier]}
    </span>
  );
}

function FirstRun({ name }: { name: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-4xl">Welcome, {name}</h1>
      <p className="mt-3 text-slate">Nothing&apos;s been logged yet. Two things get the table set:</p>
      <Panel className="mt-6 divide-y divide-line">
        <Link href="/plays" className="block p-4 hover:bg-felt-soft">
          <span className="font-semibold">Import plays from Discord</span>
          <span className="block text-sm text-slate">Reads the plays channel and fills in your history.</span>
        </Link>
        <Link href="/settings" className="block p-4 hover:bg-felt-soft">
          <span className="font-semibold">Add your BGG collection</span>
          <span className="block text-sm text-slate">Your games join the shared shelf.</span>
        </Link>
      </Panel>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-36" />
      <Skeleton className="h-24" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
