import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar, Empty, GameCover, NewBadge, Section, Skeleton, TextLink, formatDate } from "@/components/ui";
import { localDate } from "@/lib/nights";
import { TIERS } from "@/db/enums";
import { TIER_LABEL } from "@/lib/tier";
import { requireUser } from "@/lib/session";
import { getPerson, isNewMember } from "@/lib/queries";

export const metadata: Metadata = { title: "Person" };

export default function PersonPage(props: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Person params={props.params} />
    </Suspense>
  );
}

type ListGame = { id: number; name: string; thumbnail: string | null };

async function Person({ params }: { params: PageProps<"/people/[id]">["params"] }) {
  const me = await requireUser();
  const data = await getPerson((await params).id);
  if (!data) notFound();
  const { member: m, collection, wishlist, top, keen, played } = data;
  const isMe = m.id === me.id;

  return (
    <div className="space-y-10">
      <header className="flex items-center gap-4">
        <Avatar src={m.image} name={m.name} color={m.color} className="size-16" />
        <div className="min-w-0">
          <h1 className="font-display flex items-center gap-3 text-3xl sm:text-4xl">
            <span className="truncate">{m.name}</span>
            {isNewMember(m.joinedAt) && <NewBadge />}
          </h1>
          <p className="mt-1 text-sm text-slate">
            Joined {formatDate(localDate(m.joinedAt), { month: "long", day: "numeric" })}
            {m.bggUsername && (
              <>
                {" · "}
                <a
                  href={`https://boardgamegeek.com/collection/user/${encodeURIComponent(m.bggUsername)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {m.bggUsername} on BGG
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-3">
        <Section title="Favorites">
          <div className="space-y-5">
            {TIERS.map((tier) => (
              <div key={tier}>
                <h3 className="mb-1.5 text-xs font-medium text-slate">{TIER_LABEL[tier]}</h3>
                <GameList games={top[tier]} numbered empty={`${isMe ? "You haven't" : `${m.name} hasn't`} ranked any yet.`} />
              </div>
            ))}
          </div>
        </Section>
        <Section title="Wants to play" action={<span className="text-xs text-slate">🔥 must play first</span>}>
          <GameList
            games={keen.map((g) => ({ ...g, meta: g.mustPlay ? "🔥" : undefined }))}
            empty="Nothing marked yet."
          />
        </Section>
        <Section title="Played most with the group">
          <GameList games={played.map((g) => ({ ...g, meta: `${g.plays}×` }))} empty="No plays logged yet." />
        </Section>
      </div>

      {wishlist.length > 0 && (
        <Section title="BGG wishlist">
          <GameList games={wishlist} className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3" />
        </Section>
      )}

      <Section
        title={`${isMe ? "Your" : `${m.name}'s`} games (${collection.length})`}
        action={collection.length > 0 && <TextLink href={`/shelf?owner=${m.id}`}>Filter the shelf</TextLink>}
      >
        {collection.length ? (
          <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-8">
            {collection.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}`} className="group block">
                  <GameCover src={g.thumbnail} image={g.image} name={g.name} size="fluid" sizes="(min-width: 1024px) 10vw, (min-width: 640px) 18vw, 30vw" />
                  <span className="mt-1.5 block truncate text-xs font-medium group-hover:underline">{g.name}</span>
                  <span className="tabular text-xs text-slate">{g.plays ? `${g.plays}× played` : "unplayed"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : isMe ? (
          <Empty>
            Your games aren&apos;t on the shelf yet. <TextLink href="/settings#bgg">Add your BGG collection</TextLink>
          </Empty>
        ) : (
          <Empty>{m.name} hasn&apos;t added a BGG collection yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function GameList({
  games,
  numbered,
  empty,
  className,
}: {
  games: (ListGame & { meta?: string })[];
  numbered?: boolean;
  empty?: string;
  className?: string;
}) {
  if (!games.length) return <Empty>{empty}</Empty>;
  const List = numbered ? "ol" : "ul";
  return (
    <List className={className ?? "space-y-2"}>
      {games.map((g, i) => (
        <li key={g.id} className={className ? "py-1" : undefined}>
          <Link href={`/games/${g.id}`} className="-m-1 flex items-center gap-3 rounded-lg p-1 hover:bg-felt-soft">
            {numbered && <span className="font-display w-5 text-accent tabular">{i + 1}</span>}
            <GameCover src={g.thumbnail} name={g.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
            {g.meta && <span className="tabular text-xs text-slate">{g.meta}</span>}
          </Link>
        </li>
      ))}
    </List>
  );
}
