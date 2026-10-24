import type { Metadata } from "next";
import { Suspense } from "react";
import { Empty, PageHeader, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getBgaByBggId, getMembers, getShelf } from "@/lib/queries";
import { getShelfOfShame } from "@/lib/recommend";
import { ShelfBrowser } from "./shelf-browser";

export const metadata: Metadata = { title: "Shelf" };

export default function ShelfPage(props: PageProps<"/shelf">) {
  return (
    <>
      <PageHeader title="Shelf" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Shelf searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Shelf({ searchParams }: { searchParams: PageProps<"/shelf">["searchParams"] }) {
  const me = await requireUser();
  const [games, members, bga, params] = await Promise.all([getShelf(), getMembers(), getBgaByBggId(), searchParams]);
  if (games.length === 0) {
    return (
      <Empty>
        The shelf is empty. <TextLink href="/settings">Add your BGG collection</TextLink> to start it.
      </Empty>
    );
  }
  const shame = await getShelfOfShame(Infinity, games);
  return (
    <ShelfBrowser
      games={games}
      onBga={games.filter((g) => bga.has(g.id)).map((g) => g.id)}
      members={members}
      myId={me.id}
      // Linked from a person's page: open on their games
      initialOwner={members.find((m) => m.id === params.owner)?.id ?? null}
      // Best bets first; the chance is null when nobody has enough ratings for a guess
      shame={shame.map((g) => ({ id: g.id, chance: g.group.of ? g.group.chance : null }))}
      // Linked from Home's shelf of shame
      initialShame={params.shame === "1"}
    />
  );
}
