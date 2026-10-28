import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { CASUAL_NIGHT, GROUP_NIGHTS, NIGHT_NAMES, TIME_ZONE } from "@/config";
import { DateBadge, NightTag } from "@/components/night-row";
import { NightSwitch, nightParam } from "@/components/night-switch";
import { Empty, GameCover, PageHeader, Panel, PlayerChip, Section, Skeleton, buttonClass, formatDate } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getAllGamesForPicker, getPlayers, getPlays, getReviewQueue, getWhichQueue, type PlayRow } from "@/lib/queries";
import { type NightSummary, getNightsByDate } from "@/lib/events";
import { zonedToUtc } from "@/lib/nights";
import { inSentence } from "@/lib/text";
import { lastSyncedAt } from "@/lib/sync";
import { canPostToDiscord } from "@/lib/discord";
import { LogPlayForm } from "./log-play-form";
import { ReviewRow } from "./review-row";
import { WhichRow } from "./which-row";
import { SyncDiscordButton } from "./sync-button";
import { DeletePlayButton } from "./delete-play-button";
import { EditPlayButton, PlayEditorProvider } from "./play-editor";

export const metadata: Metadata = { title: "Plays" };

const PAGE_SIZE = 60;

export default function PlaysPage(props: PageProps<"/plays">) {
  return (
    <>
      <PageHeader title="Plays">
        {/* Reading the channel needs the same bot and channel as posting to it */}
        {canPostToDiscord() && <SyncDiscordButton />}
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Plays searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Plays({ searchParams }: { searchParams: PageProps<"/plays">["searchParams"] }) {
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const night = CASUAL_NIGHT ? nightParam(params.night) : undefined;
  const pageHref = (n: number) => `/plays?${new URLSearchParams({ ...(night ? { night } : {}), page: String(n) })}`;
  const canPost = Object.fromEntries(GROUP_NIGHTS.map((n) => [n, canPostToDiscord(n)]));
  const [plays, review, which, games, players, synced] = await Promise.all([
    getPlays({ limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE, night }),
    getReviewQueue(),
    getWhichQueue(),
    getAllGamesForPicker(),
    getPlayers(),
    lastSyncedAt(),
  ]);
  const hasMore = plays.length > PAGE_SIZE;
  const nights = groupByNight(plays.slice(0, PAGE_SIZE));
  const stored = await getNightsByDate(nights.map(([, ps]) => ({ night: ps[0].night, date: ps[0].playedOn })));

  return (
    <PlayEditorProvider games={games} players={players} canPost={canPost} nightNames={NIGHT_NAMES}>
      <div className="space-y-10">
        {synced && <p className="-mt-4 text-xs text-slate">Discord last checked {synced.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>}

        {review.length > 0 && (
          <Section id="review" title="Needs a game match" className="scroll-mt-6" action={<span className="text-xs text-slate">fixing one fixes every play with that name</span>}>
            <Panel className="divide-y divide-line">
              {review.map((r) => (
                <ReviewRow key={r.gameName} gameName={r.gameName} count={r.count} games={games} />
              ))}
            </Panel>
          </Section>
        )}

        {which.length > 0 && (
          <Section id="which" title="Who was it?" className="scroll-mt-6" action={<span className="text-xs text-slate">more than one player has these names</span>}>
            <Panel className="divide-y divide-line">
              {which.map((w) => (
                <WhichRow
                  key={w.key}
                  night={w.night}
                  playedOn={w.playedOn}
                  name={w.name}
                  when={[formatDate(w.playedOn), CASUAL_NIGHT && NIGHT_NAMES[w.night], w.location].filter(Boolean).join(" · ")}
                  seatedId={w.seatedId}
                  choices={w.choices}
                />
              ))}
            </Panel>
          </Section>
        )}

        <details className="group rounded-xl border border-line bg-card" open={plays.length === 0}>
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold marker:hidden">
            <span className="group-open:hidden">+ Log a play</span>
            <span className="hidden group-open:inline">Log a play</span>
          </summary>
          <div className="border-t border-line p-4">
            <LogPlayForm games={games} players={players} canPost={canPost} nightNames={NIGHT_NAMES} />
          </div>
        </details>

        {CASUAL_NIGHT && <NightSwitch current={night} href={(n) => (n ? `/plays?night=${n}` : "/plays")} all="All" />}

        {nights.length === 0 ? (
          <Empty>{night ? `No ${inSentence(NIGHT_NAMES[night])} plays yet.` : "No plays yet. Sync from Discord or log one by hand."}</Empty>
        ) : (
          <ol className="space-y-4">
            {nights.map(([key, nightPlays]) => (
              <li key={key}>
                <NightCard plays={nightPlays} stored={stored.get(`${nightPlays[0].night}:${nightPlays[0].playedOn}`)} />
              </li>
            ))}
          </ol>
        )}

        <nav className="flex justify-between">
          {page > 1 ? <Link className={buttonClass("secondary")} href={pageHref(page - 1)}>Newer</Link> : <span />}
          {hasMore && <Link className={buttonClass("secondary")} href={pageHref(page + 1)}>Older</Link>}
        </nav>
      </div>
    </PlayEditorProvider>
  );
}

/**
 * One night's plays, as a card like the nights on Home and Plan. Its header opens the night's
 * page; below it, who came and each game, with its own edit and delete.
 */
function NightCard({ plays, stored }: { plays: PlayRow[]; stored: NightSummary | undefined }) {
  const [first] = plays;
  const table = roster(plays);
  const games = new Set(plays.map((p) => p.gameId ?? p.name)).size;
  const header = (
    <>
      <DateBadge iso={stored?.startsAt ?? zonedToUtc(first.playedOn, "19:00", TIME_ZONE).toISOString()} night={first.night} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-lg leading-tight underline-offset-4 group-hover/night:underline">
            {stored?.title ?? formatDate(first.playedOn, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <NightTag night={first.night} />
        </span>
        <span className="block text-sm text-slate">
          {[first.location, `${games} ${games === 1 ? "game" : "games"}`, table.length > 0 && `${table.length} played`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </>
  );
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-card">
      {stored ? (
        <Link href={`/events/${stored.id}`} className="group/night flex items-start gap-4 p-3 hover:bg-felt-soft/40">
          {header}
          <span className="flex shrink-0 items-center gap-0.5 self-center text-sm font-medium text-accent">
            <span className="hidden sm:inline">See the event</span>
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      ) : (
        <div className="flex items-start gap-4 p-3">{header}</div>
      )}
      {table.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2.5" aria-label="Who played">
          {table.map((s) => (
            <PlayerChip key={s.playerId} name={s.name} color={s.color} />
          ))}
        </div>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {plays.map((p) => (
          <PlayItem key={p.id} play={p} showPlayers={!samePlayers(p.players, table)} />
        ))}
      </ul>
    </article>
  );
}

/** The players of a game are only listed when they aren't the whole night's table. */
function PlayItem({ play, showPlayers }: { play: PlayRow; showPlayers: boolean }) {
  const body = (
    <>
      <GameCover src={play.thumbnail} name={play.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{play.name}</span>
          {play.needsReview && <span className="text-xs text-meeple-orange">unmatched</span>}
        </div>
        {showPlayers && (
          <div className="mt-1 flex flex-wrap gap-1">
            {play.players.map((s) => (
              <PlayerChip key={s.playerId} name={s.name} color={s.color} />
            ))}
          </div>
        )}
        {play.notes && <p className="mt-1.5 text-sm text-slate">{play.notes}</p>}
      </div>
    </>
  );
  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      {play.gameId ? (
        <Link href={`/games/${play.gameId}`} className="flex min-w-0 flex-1 items-start gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
      )}
      <span className="flex shrink-0">
        <EditPlayButton
          play={{
            playId: play.id,
            name: play.name,
            gameId: play.gameId,
            playedOn: play.playedOn,
            location: play.location,
            notes: play.notes,
            playerIds: play.players.map((s) => s.playerId),
            night: play.night,
            discord: play.source === "manual" ? (play.sourceRef ? "app-post" : "none") : "hand-post",
          }}
        />
        <DeletePlayButton id={play.id} name={play.name} postedByApp={play.source === "manual" && Boolean(play.sourceRef)} />
      </span>
    </li>
  );
}

/** Everyone who played anything that night, in the order they first show up */
function roster(plays: PlayRow[]) {
  const seen = new Map<number, PlayRow["players"][number]>();
  for (const s of plays.flatMap((p) => p.players)) if (!seen.has(s.playerId)) seen.set(s.playerId, s);
  return [...seen.values()];
}

function samePlayers(a: { playerId: number }[], b: { playerId: number }[]) {
  return a.length === b.length && a.every((s) => b.some((t) => t.playerId === s.playerId));
}

/** A day's plays, kept apart by night in the rare case both happened on one day */
function groupByNight(plays: PlayRow[]) {
  const nights = new Map<string, PlayRow[]>();
  for (const p of plays) {
    const key = `${p.playedOn}:${p.night}`;
    nights.set(key, [...(nights.get(key) ?? []), p]);
  }
  return [...nights.entries()];
}
