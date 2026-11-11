"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import clsx from "clsx";
import { CalendarDays, CircleHelp, Ellipsis, Globe, House, Library, ListOrdered, ScrollText, Settings, Sparkles, Users } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: House },
  { href: "/plays", label: "Plays", icon: ScrollText },
  { href: "/shelf", label: "Shelf", icon: Library },
  { href: "/rankings", label: "Rankings", icon: ListOrdered },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/people", label: "People", icon: Users },
  { href: "/discover", label: "Discover", icon: Sparkles },
  { href: "/online", label: "Online", icon: Globe },
  { href: "/about", label: "How it works", icon: CircleHelp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Mobile: the five things people reach for at the table. */
const TAB_LINKS = LINKS.filter((l) => !["/settings", "/discover", "/online", "/people", "/about"].includes(l.href));

/** Mobile: the rest, under the header's ⋯ menu. Settings is the avatar beside it. */
const MORE_LINKS = LINKS.filter((l) => ["/people", "/discover", "/online", "/about"].includes(l.href));

/** A count shown beside a link, like how many games are waiting to be ranked */
export type NavBadges = Partial<Record<(typeof LINKS)[number]["href"], { count: number; label: string }>>;

const badgeText = (n: number) => (n > 9 ? "9+" : String(n));

/** An event's page is part of Plan */
const SECTIONS: Record<string, string[]> = { "/plan": ["/events"] };

const isActive = (pathname: string | null, href: string) =>
  pathname !== null &&
  (href === "/" ? pathname === "/" : [href, ...(SECTIONS[href] ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`)));

// The pathname is URL data, so the active highlight streams in behind Suspense;
// the links themselves render in the static shell.
function WithPathname({ render }: { render: (pathname: string | null) => React.ReactNode }) {
  return <Suspense fallback={render(null)}><Active render={render} /></Suspense>;
}

function Active({ render }: { render: (pathname: string | null) => React.ReactNode }) {
  return render(usePathname());
}

export function SideNav({ badges = {} }: { badges?: NavBadges }) {
  return (
    <WithPathname
      render={(pathname) => (
        <nav className="flex flex-col gap-0.5">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-felt-ink/75 hover:bg-white/10 hover:text-felt-ink",
                "aria-[current=page]:bg-felt-ink aria-[current=page]:text-felt aria-[current=page]:shadow-token",
              )}
            >
              <Icon className="size-4.5" strokeWidth={2} />
              {label}
              {badges[href] && (
                <span title={badges[href].label} className="tabular ml-auto rounded-full bg-meeple-yellow px-1.5 py-px text-[0.7rem] font-semibold text-ink">
                  {badgeText(badges[href].count)}
                  <span className="sr-only"> {badges[href].label}</span>
                </span>
              )}
            </Link>
          ))}
        </nav>
      )}
    />
  );
}

export function TabBar({ badges = {} }: { badges?: NavBadges }) {
  return (
    <WithPathname
      render={(pathname) => (
        <nav className="grid grid-cols-5 border-t border-ink/20 bg-felt pb-[env(safe-area-inset-bottom)] text-felt-ink">
          {TAB_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 py-2 text-[0.7rem] text-felt-ink/70 aria-[current=page]:font-semibold aria-[current=page]:text-felt-ink"
            >
              <span className="relative">
                <Icon className="size-5" />
                {badges[href] && (
                  <span className="tabular absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-meeple-yellow px-1 text-center text-[0.6rem] leading-4 font-semibold text-ink">
                    {badgeText(badges[href].count)}
                    <span className="sr-only"> {badges[href].label}</span>
                  </span>
                )}
              </span>
              {label}
            </Link>
          ))}
        </nav>
      )}
    />
  );
}

export function MoreMenu() {
  return <WithPathname render={(pathname) => <MoreMenuButton pathname={pathname} />} />;
}

function MoreMenuButton({ pathname }: { pathname: string | null }) {
  // Remembering where it was opened closes it on its own once a link navigates away
  const [openOn, setOpenOn] = useState<string | null | undefined>(undefined);
  const open = openOn === pathname;
  const close = () => setOpenOn(undefined);

  return (
    <div className="relative" onKeyDown={(e) => e.key === "Escape" && close()}>
      <button
        type="button"
        aria-label="More pages"
        aria-expanded={open}
        aria-controls="more-pages"
        onClick={() => (open ? close() : setOpenOn(pathname))}
        className="grid size-9 place-items-center rounded-lg text-felt-ink/80 hover:bg-white/10 aria-expanded:bg-white/10"
      >
        <Ellipsis className="size-5" />
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={close} className="fixed inset-0 z-30 cursor-default" />
          <nav id="more-pages" className="absolute top-full right-0 z-40 mt-2 w-48 rounded-xl border border-line bg-card p-1 text-ink shadow-lg">
            {MORE_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-felt-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
