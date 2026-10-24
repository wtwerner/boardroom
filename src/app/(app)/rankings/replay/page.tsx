import type { Metadata } from "next";
import { Suspense } from "react";
import { Empty, PageHeader, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getRankingLists, getRankingPool } from "@/lib/queries";
import { inSentence } from "@/lib/text";
import { TIER_LABEL } from "@/lib/tier";
import { RankingTabs, TierSwitch, tierHref, tierParam } from "../tabs";
import { ReplayChallenge } from "./replay-challenge";

export const metadata: Metadata = { title: "Replay this or that" };

export default function ReplayPage(props: PageProps<"/rankings/replay">) {
  return (
    <>
      <PageHeader title="Rankings">
        <RankingTabs current="rank" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Replay searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Replay({ searchParams }: { searchParams: PageProps<"/rankings/replay">["searchParams"] }) {
  const me = await requireUser();
  const tier = tierParam((await searchParams).tier);
  const lists = await getRankingLists(tier);
  const mine = lists[me.id] ?? [];
  const games = await getRankingPool(me.id, me.playerId, mine, tier);

  return (
    <div className="max-w-2xl space-y-4">
      <TierSwitch current={tier} path="/rankings/replay" />
      <p className="text-sm text-slate">
        Rank your {inSentence(TIER_LABEL[tier])} again from scratch, one &ldquo;this or that?&rdquo; at a time. Your current list stays hidden so
        it doesn&apos;t sway you; answer by how you feel now. Every answer counts toward the result, so one odd pick won&apos;t sink a
        game. Nothing changes until you save. <TextLink href={tierHref("/rankings", tier)}>Back to your ranking</TextLink>
      </p>
      {games.length < 2 ? (
        <Empty>Play at least two games with the group and there&apos;s something to compare.</Empty>
      ) : (
        <ReplayChallenge key={tier} userId={me.id} tier={tier} games={games} current={mine} />
      )}
    </div>
  );
}
