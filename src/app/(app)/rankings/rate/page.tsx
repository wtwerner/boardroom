import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CLAUDE, NIGHT_NAMES } from "@/config";
import { inSentence } from "@/lib/text";
import { MUST_PLAY_LIMIT, SENTIMENTS } from "@/db/enums";
import { formatBggRating } from "@/lib/bgg-ratings";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { Empty, GameCover, PageHeader, Panel, Section, Skeleton, TextLink, buttonClass, formatDate } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getMustPlayLeft, getRateableGames } from "@/lib/queries";
import { OpinionControls } from "../../games/[id]/opinion-controls";
import { RankingTabs } from "../tabs";

export const metadata: Metadata = { title: "Rate games" };

export default function RatePage() {
  return (
    <>
      <PageHeader title="Rankings">
        <RankingTabs current="rate" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Rate />
      </Suspense>
    </>
  );
}

type Row = Awaited<ReturnType<typeof getRateableGames>>["played"][number] & { meta: string };

async function Rate() {
  const me = await requireUser();
  // A casual account's shelf is what can come to their night: everyone's collections
  const member = me.access === "member";
  const [{ played, unplayed }, mustPlayLeft] = await Promise.all([getRateableGames(me.id, me.playerId, member ? "core" : "casual"), getMustPlayLeft(me.id)]);
  const rated = played.filter((g) => g.sentiment).length;
  // Unrated first so a return visit starts where you left off
  const byUnrated = <T extends { sentiment: unknown }>(a: T, b: T) => Number(Boolean(a.sentiment)) - Number(Boolean(b.sentiment));
  const suggestions = [...played, ...unplayed].flatMap((g) => g.suggested ?? []);
  // "4 😍, 9 🙂, 2 😐": what taking them all would do
  const summary = SENTIMENTS.flatMap((s) => {
    const n = suggestions.filter((x) => x === s).length;
    return n ? [`${n} ${SENTIMENT_LABEL[s].emoji}`] : [];
  }).join(", ");
  const onBgg = (g: { bggRating: number | null }) => (g.bggRating !== null ? `, ${formatBggRating(g.bggRating)} on BGG` : "");

  return (
    <div className="max-w-3xl space-y-10">
      <p className="text-sm text-slate">
        Tap a face for how you feel about each game.{" "}
        {member ? (
          <>These feed the dashboard, planning{CLAUDE ? <> and Claude&apos;s suggestions</> : " and Discover"}.</>
        ) : (
          <>They help pick what to play at the {inSentence(NIGHT_NAMES.casual)}.</>
        )}{" "}
        <strong className="font-semibold text-ink">🔥 Must play</strong> is for the few games you really want on the table: you get{" "}
        {MUST_PLAY_LIMIT}, and one comes back each time you play its game. You have {mustPlayLeft} left.
      </p>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-ink/50 bg-card p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <strong className="font-semibold">
              Your BGG ratings suggest faces for {suggestions.length === 1 ? "1 game" : `${suggestions.length} games`}
            </strong>{" "}
            you haven&apos;t rated here ({summary}). Check them in one list, change or skip any, then rate them together.
          </p>
          <Link href="/rankings/rate/bgg" className={buttonClass("primary", "shrink-0")}>
            Review them
          </Link>
        </div>
      )}

      <Section
        title="Games you've played"
        action={played.length > 0 && <span className="tabular text-xs text-slate">{rated} of {played.length} rated</span>}
      >
        {played.length ? (
          <RateList
            rows={[...played].sort(byUnrated).map((g) => ({ ...g, meta: `${g.plays}× with the group, last ${formatDate(g.lastPlayed!)}${onBgg(g)}` }))}
            mustPlayLeft={mustPlayLeft}
          />
        ) : (
          <Empty>
            Nothing logged with you in it yet.
            {member && (
              <>
                {" "}
                If you&apos;re in old plays under another name, <TextLink href="/settings#players">claim them in Settings</TextLink>.
              </>
            )}
          </Empty>
        )}
      </Section>

      <Section title={member ? "On the shelf, not played by you" : "Games people own that you haven't played"}>
        {unplayed.length ? (
          <RateList rows={[...unplayed].sort(byUnrated).map((g) => ({ ...g, image: null, plays: 0, lastPlayed: null, meta: `owned by ${g.owners}${onBgg(g)}` }))} mustPlayLeft={mustPlayLeft} />
        ) : (
          <Empty>{member ? "You've played everything on the shelf." : "You've played everything people own."}</Empty>
        )}
      </Section>
    </div>
  );
}

function RateList({ rows, mustPlayLeft }: { rows: Row[]; mustPlayLeft: number }) {
  return (
    <Panel className="divide-y divide-line">
      {rows.map((g) => (
        <div key={g.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <Link href={`/games/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
            <GameCover src={g.thumbnail} name={g.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{g.name}</span>
              <span className="block truncate text-xs text-slate">{g.meta}</span>
            </span>
          </Link>
          <OpinionControls
            compact
            gameId={g.id}
            sentiment={g.sentiment}
            wantToPlay={g.wantToPlay}
            mustPlay={g.mustPlay}
            mustPlayLeft={g.mustPlay ? mustPlayLeft + 1 : mustPlayLeft}
            suggested={g.suggested}
            bggRating={g.bggRating}
          />
        </div>
      ))}
    </Panel>
  );
}
