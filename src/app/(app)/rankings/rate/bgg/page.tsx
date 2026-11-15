import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, TextLink } from "@/components/ui";
import { BANDS, formatBggRating, ratingBaseline } from "@/lib/bgg-ratings";
import { getMyBggRatings, getRateableGames } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { RankingTabs } from "../../tabs";
import { BggReview, type ReviewRow } from "./bgg-review";

export const metadata: Metadata = { title: "Review BGG suggestions" };

export default function ReviewBggPage() {
  return (
    <>
      <PageHeader title="Rankings">
        <RankingTabs current="rate" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Review />
      </Suspense>
    </>
  );
}

/**
 * Every game on Rate games I haven't rated here but have rated on BGG, with the face that rating
 * suggests, to check and change before any of it counts. Nothing is rated until I say so.
 */
async function Review() {
  const me = await requireUser();
  const [{ played, unplayed }, bgg] = await Promise.all([getRateableGames(me.id, me.playerId, me.access === "member" ? "core" : "casual"), getMyBggRatings(me.id)]);
  const rows: ReviewRow[] = [
    ...played.map((g) => ({ ...g, where: `played ${g.plays}× with the group` })),
    ...unplayed.map((g) => ({ ...g, where: "on the shelf" })),
  ].flatMap((g) =>
    g.suggested && g.bggRating !== null
      ? [{ id: g.id, name: g.name, thumbnail: g.thumbnail, bggRating: g.bggRating, suggested: g.suggested, where: g.where }]
      : [],
  );
  const baseline = ratingBaseline([...bgg.values()]);
  // "😍 from 8.5, 🙂 from 6.5, 😐 from 5, 🙅 below 5" for their own average
  const cutoffs = BANDS.filter((b) => Number.isFinite(b.from))
    .map((b) => `${SENTIMENT_LABEL[b.sentiment].emoji} from ${formatBggRating(baseline + b.from)}`)
    .join(", ");
  const lowest = formatBggRating(baseline + BANDS.at(-2)!.from);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm">
          <TextLink href="/rankings/rate">← Rate games</TextLink>
        </p>
        <h2 className="font-wide text-xl">Review your BGG suggestions</h2>
        <p className="text-sm text-slate">
          Faces for the games you&apos;ve rated on BGG but not here, read against your own BGG average of {formatBggRating(baseline)}:{" "}
          {cutoffs}, {SENTIMENT_LABEL.nope.emoji} below {lowest}. Change any that are off, or skip ones you&apos;d rather rate later. Nothing is
          rated until you save.
        </p>
      </div>
      <BggReview rows={rows} hasBgg={bgg.size > 0} />
    </div>
  );
}
