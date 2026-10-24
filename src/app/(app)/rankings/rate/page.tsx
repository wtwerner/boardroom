import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MUST_PLAY_LIMIT } from "@/db/enums";
import { Empty, GameCover, PageHeader, Panel, Section, Skeleton, TextLink, formatDate } from "@/components/ui";
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
  const [{ played, unplayed }, mustPlayLeft] = await Promise.all([getRateableGames(me.id, me.playerId), getMustPlayLeft(me.id)]);
  const rated = played.filter((g) => g.sentiment).length;
  // Unrated first so a return visit starts where you left off
  const byUnrated = <T extends { sentiment: unknown }>(a: T, b: T) => Number(Boolean(a.sentiment)) - Number(Boolean(b.sentiment));

  return (
    <div className="max-w-3xl space-y-10">
      <p className="text-sm text-slate">
        Tap a face for how you feel about each game. These feed the dashboard, planning and Claude&apos;s suggestions.{" "}
        <strong className="font-semibold text-ink">🔥 Must play</strong> is for the few games you really want on the table: you get{" "}
        {MUST_PLAY_LIMIT}, and one comes back each time you play its game. You have {mustPlayLeft} left.
      </p>

      <Section
        title="Games you've played"
        action={played.length > 0 && <span className="tabular text-xs text-slate">{rated} of {played.length} rated</span>}
      >
        {played.length ? (
          <RateList
            rows={[...played].sort(byUnrated).map((g) => ({ ...g, meta: `${g.plays}× with the group, last ${formatDate(g.lastPlayed!)}` }))}
            mustPlayLeft={mustPlayLeft}
          />
        ) : (
          <Empty>
            Nothing logged with you in it yet. If you&apos;re in old plays under another name, <TextLink href="/settings#players">claim them in Settings</TextLink>.
          </Empty>
        )}
      </Section>

      <Section title="On the shelf, not played by you">
        {unplayed.length ? (
          <RateList rows={[...unplayed].sort(byUnrated).map((g) => ({ ...g, image: null, plays: 0, lastPlayed: null, meta: `owned by ${g.owners}` }))} mustPlayLeft={mustPlayLeft} />
        ) : (
          <Empty>You&apos;ve played everything on the shelf.</Empty>
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
          />
        </div>
      ))}
    </Panel>
  );
}
