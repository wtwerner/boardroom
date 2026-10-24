import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Empty, GameCover, Meeple, PageHeader, Panel, Section, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getGroupRanking, getMembers, getNewToRank, getRankingLists, getRankingPool } from "@/lib/queries";
import { RankingEditor } from "./ranking-editor";
import { HEAVY_WEIGHT } from "@/lib/tier";
import { CASUAL_NIGHT } from "@/config";
import { TIERS } from "@/db/enums";
import { RankingTabs, TierSwitch, tierHref, tierParam } from "./tabs";

export const metadata: Metadata = { title: "Rankings" };

export default function RankingsPage(props: PageProps<"/rankings">) {
  return (
    <>
      <PageHeader title="Rankings">
        <RankingTabs current="rank" />
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Rankings searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Rankings({ searchParams }: { searchParams: PageProps<"/rankings">["searchParams"] }) {
  const me = await requireUser();
  const tier = tierParam((await searchParams).tier);
  const [lists, group, members, toRank] = await Promise.all([getRankingLists(tier), getGroupRanking(tier), getMembers(), getNewToRank(me.id, me.playerId)]);
  const mine = lists[me.id] ?? [];
  const games = await getRankingPool(me.id, me.playerId, mine, tier);
  const voters = members.filter((m) => lists[m.id]?.length);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <TierSwitch
          current={tier}
          path="/rankings"
          waiting={Object.fromEntries(TIERS.map((t) => [t, toRank.filter((g) => g.tier === t).length]))}
        />
        <p className="max-w-2xl text-sm text-slate">
          {tier === "heavy"
            ? `BGG weight ${HEAVY_WEIGHT} and up${CASUAL_NIGHT ? ", whichever kind of event they were played at" : ""}.`
            : `Under BGG weight ${HEAVY_WEIGHT}.`}{" "}
          A game in the wrong list can be moved from its page.
        </p>
      </div>
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Section
        title="Your ranking"
        action={games.length >= 2 && <TextLink href={tierHref("/rankings/replay", tier)}>Replay this or that</TextLink>}
      >
        <p className="mb-4 text-sm text-slate">
          Every one you&apos;ve played, best first. New ones are placed with a few quick questions; drag to fine-tune.
        </p>
        <RankingEditor key={tier} tier={tier} games={games} initial={mine} />
      </Section>

      <Section title="The group's list">
        <p className="mb-3 text-sm text-slate">
          <strong className="font-semibold text-ink">Beats</strong> is how much of each person&apos;s list a game is ranked above, on average:
          100% tops every list, 50% is the middle. Games few people have ranked are pulled toward 50%.{" "}
          <TextLink href="/about#rankings">How it works</TextLink>
        </p>
        {group.length === 0 ? (
          <Empty>Once people rank their favorites, the combined list shows up here.</Empty>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-slate">
                  <th className="py-2 pr-2 pl-3 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Game</th>
                  {voters.map((v) => (
                    <th key={v.id} className="px-1.5 py-2 text-center font-medium">
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <Meeple color={v.color} />
                        <span className="max-w-14 truncate">{v.name}</span>
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pr-3 pl-2 text-right font-medium" title="On average, the share of the other games in each person's list it's ranked above">Beats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {group.map((r, i) => (
                  <tr key={r.gameId}>
                    <td className="font-display tabular py-2 pr-2 pl-3 text-accent">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <Link href={`/games/${r.gameId}`} className="flex items-center gap-2 hover:underline">
                        <GameCover src={r.game.thumbnail} name={r.game.name} size="sm" className="size-8!" />
                        <span className="font-medium">{r.game.name}</span>
                      </Link>
                    </td>
                    {voters.map((v) => (
                      <td key={v.id} className="tabular px-1.5 py-2 text-center text-slate">
                        {r.positions[v.id] !== undefined ? r.positions[v.id] + 1 : ""}
                      </td>
                    ))}
                    <td className="tabular py-2 pr-3 pl-2 text-right font-semibold">{r.points}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </Section>
    </div>
    </div>
  );
}
