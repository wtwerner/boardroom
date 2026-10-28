import Link from "next/link";
import { Suspense, cache } from "react";
import { DEMO, SITE_NAME } from "@/config";
import { MoreMenu, type NavBadges, SideNav, TabBar } from "@/components/nav";
import { Avatar, Meeple } from "@/components/ui";
import { getNewToRank } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-felt p-4 text-felt-ink md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2 pt-1">
          <Meeple color="yellow" className="size-7" />
          <span className="font-display text-xl tracking-tight">{SITE_NAME}</span>
        </Link>
        <Suspense fallback={<SideNav />}>
          <WithBadges nav={SideNav} />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<div className="h-10" />}>
            <UserBadge />
          </Suspense>
          <BggCredit className="mt-3 px-2 text-felt-ink/60 hover:text-felt-ink" />
        </div>
      </aside>

      <header className="flex items-center justify-between bg-felt px-4 py-3 text-felt-ink md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Meeple color="yellow" className="size-6" />
          <span className="font-display text-lg">{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-1">
          <MoreMenu />
          <Suspense fallback={<span className="size-9" />}>
            <HeaderAvatar />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-16 lg:px-10">
        {DEMO && <DemoBanner />}
        {children}
        <BggCredit className="mt-12 text-slate hover:text-ink md:hidden" />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
        <Suspense fallback={<TabBar />}>
          <WithBadges nav={TabBar} />
        </Suspense>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <p role="note" className="-mt-2 mb-6 rounded-lg border border-meeple-yellow/60 bg-meeple-yellow/10 px-3 py-2 text-sm md:-mt-4">
      This is a demo with a made-up group. Change anything you like: it all resets every night.{" "}
      <a href="https://github.com/wtwerner/boardroom" className="text-accent underline-offset-4 hover:underline">
        Want one for your group?
      </a>
    </p>
  );
}

/** BGG's API terms ask for credit back to BoardGameGeek. */
function BggCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://boardgamegeek.com"
      target="_blank"
      rel="noreferrer"
      className={`block text-xs underline-offset-2 hover:underline ${className ?? ""}`}
    >
      Data and images from BoardGameGeek
    </a>
  );
}

// Both navs ask, so once per request
const countToRank = cache(async () => {
  const me = await requireUser();
  return (await getNewToRank(me.id, me.playerId)).length;
});

/** The nav with counts beside its links: games you've played that aren't in your ranking yet */
async function WithBadges({ nav: Nav }: { nav: typeof SideNav }) {
  const toRank = await countToRank();
  const badges: NavBadges = toRank ? { "/rankings": { count: toRank, label: toRank === 1 ? "game to rank" : "games to rank" } } : {};
  return <Nav badges={badges} />;
}

async function HeaderAvatar() {
  const me = await requireUser();
  return (
    <Link href="/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-full hover:bg-white/10">
      <Avatar src={me.image} name={me.name} color={me.color} className="size-7" />
    </Link>
  );
}

async function UserBadge() {
  const me = await requireUser();
  return (
    <Link href="/settings" className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/10">
      <Avatar src={me.image} name={me.name} color={me.color} />
      <span className="truncate text-sm font-medium">{me.name}</span>
    </Link>
  );
}
