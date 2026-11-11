import type { Metadata } from "next";
import { Suspense } from "react";
import { CASUAL_NIGHT, NIGHT_NAMES } from "@/config";
import { Empty, PageHeader, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getBgaByBggId, getMembers, getShelf, getWholeShelf } from "@/lib/queries";
import { getShelfOfShame } from "@/lib/recommend";
import { inSentence } from "@/lib/text";
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

/**
 * Everyone's games, members' and casual accounts' alike, so anyone can see what the whole group
 * owns. It narrows to the casual night's regulars (what could come there) or, for members, to the
 * core group's. A casual account never sees the core group named.
 */
async function Shelf({ searchParams }: { searchParams: PageProps<"/shelf">["searchParams"] }) {
  const me = await requireUser();
  const params = await searchParams;
  const member = me.access === "member";
  const [{ games, people, regulars }, bga, members, coreShelf] = await Promise.all([
    getWholeShelf(),
    member ? getBgaByBggId() : null,
    member ? getMembers() : [],
    // The shelf of shame is the core group's: owned by members, unplayed together, scored against their taste
    member ? getShelf() : [],
  ]);
  if (games.length === 0) {
    return (
      <Empty>
        The shelf is empty. <TextLink href="/settings#bgg">Add your BGG collection</TextLink> to start it.
      </Empty>
    );
  }
  const shame = coreShelf.length ? await getShelfOfShame(Infinity, coreShelf) : [];
  const groups = [
    ...(member && CASUAL_NIGHT ? [{ id: "core", label: `${NIGHT_NAMES.core} group`, ownerIds: members.map((m) => m.id) }] : []),
    ...(CASUAL_NIGHT ? [{ id: "casual", label: `${NIGHT_NAMES.casual} regulars`, ownerIds: regulars }] : []),
  ];

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-slate">
        Everyone&apos;s games.
        {CASUAL_NIGHT &&
          ` Pick ${NIGHT_NAMES.casual} regulars for what could come to the ${inSentence(NIGHT_NAMES.casual)}: the games of everyone who's played at one in the last year${member ? `, and everyone with a ${inSentence(NIGHT_NAMES.casual)} account` : ""}.`}
      </p>
      <ShelfBrowser
        games={games}
        onBga={bga ? games.filter((g) => bga.has(g.id)).map((g) => g.id) : []}
        members={people}
        groups={groups}
        myId={me.id}
        // Linked from a person's page: open on their games
        initialOwner={people.find((m) => m.id === params.owner)?.id ?? null}
        // Best bets first; the chance is null when nobody has enough ratings for a guess
        shame={shame.map((g) => ({ id: g.id, chance: g.group.of ? g.group.chance : null }))}
        // Linked from Home's shelf of shame
        initialShame={member && params.shame === "1"}
        // Everyone with an account has a People page
        linkIds={people.map((m) => m.id)}
      />
    </div>
  );
}
