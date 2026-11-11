import type { Metadata } from "next";
import { Suspense } from "react";
import { CASUAL_NIGHT, NIGHT_NAMES } from "@/config";
import type { Night } from "@/db/enums";
import { Empty, PageHeader, Skeleton, TextLink } from "@/components/ui";
import { NightSwitch, nightParam } from "@/components/night-switch";
import { requireUser } from "@/lib/session";
import { getBgaByBggId, getNightShelf } from "@/lib/queries";
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

const shelfHref = (night: Night | undefined) => (night === "casual" ? "/shelf?night=casual" : "/shelf");

/**
 * Each kind of night has its own shelf, from the people who come to it, like its group list on
 * Rankings: everything that could come to the table there. Members switch between them; a casual
 * account only has its night's, with who owns what and only their own ratings.
 */
async function Shelf({ searchParams }: { searchParams: PageProps<"/shelf">["searchParams"] }) {
  const me = await requireUser();
  const params = await searchParams;
  const member = me.access === "member";
  const night: Night = !member ? "casual" : CASUAL_NIGHT ? (nightParam(params.night) ?? "core") : "core";
  const [{ games, people }, bga] = await Promise.all([getNightShelf(night), member ? getBgaByBggId() : null]);
  // What the others think stays off a casual account's pages: they get their own ratings and votes
  const shown = member
    ? games
    : games.map((g) => ({
        ...g,
        sentiments: g.sentiments.filter((o) => o.userId === me.id),
        wantToPlay: g.wantToPlay.filter((id) => id === me.id),
        mustPlay: g.mustPlay.filter((id) => id === me.id),
      }));
  // The shelf of shame is the core group's: unplayed together, scored against the members' taste
  const shame = night === "core" && games.length ? await getShelfOfShame(Infinity, games) : [];
  const casual = inSentence(NIGHT_NAMES.casual);

  return (
    <div className="space-y-6">
      {CASUAL_NIGHT && (
        <div className="space-y-2">
          {member && <NightSwitch current={night} href={shelfHref} />}
          <p className="max-w-2xl text-sm text-slate">
            {night === "core"
              ? "Everyone in the group's games."
              : member
                ? `Games owned by everyone who's played at the ${casual} in the last year, and everyone with a ${casual} account: what could come to the table there.`
                : `Games owned by the people who come to the ${casual}: what could come to the table. Pick Mine for yours.`}
          </p>
        </div>
      )}
      {games.length === 0 ? (
        <Empty>
          The shelf is empty. <TextLink href="/settings#bgg">Add your BGG collection</TextLink> to start it.
        </Empty>
      ) : (
        <ShelfBrowser
          key={night}
          games={shown}
          onBga={bga ? games.filter((g) => bga.has(g.id)).map((g) => g.id) : []}
          members={people}
          myId={me.id}
          // Linked from a person's page: open on their games
          initialOwner={people.find((m) => m.id === params.owner)?.id ?? null}
          // Best bets first; the chance is null when nobody has enough ratings for a guess
          shame={shame.map((g) => ({ id: g.id, chance: g.group.of ? g.group.chance : null }))}
          // Linked from Home's shelf of shame
          initialShame={night === "core" && params.shame === "1"}
          // People's pages are the core group's members'
          linkPeople={night === "core"}
          limited={!member}
        />
      )}
    </div>
  );
}
