import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Meeple, buttonClass } from "@/components/ui";

export type BackLink = { href: string; label: string };

/** Pages of the site, without loading them ahead of a tap: signed out, they only redirect to sign-in */
function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return href.startsWith("/") ? (
    <Link href={href} prefetch={false} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/**
 * A calendar page opens from Discord as often as from the site, so it stands alone without the
 * site's menus: a way back to where they came from, and the site's name, which goes home for
 * anyone who can open the site.
 */
export function CalendarShell({ siteName, back, home, children }: { siteName?: string; back?: BackLink | null; home?: boolean; children: ReactNode }) {
  const name = siteName && (
    <>
      <Meeple color="yellow" className="size-5" />
      {siteName}
    </>
  );
  return (
    <main className="min-h-dvh bg-table px-4 py-6 text-ink">
      <div className="mx-auto w-full max-w-md space-y-5">
        <nav className="flex min-h-6 items-center justify-between gap-3 text-sm">
          {back ? (
            <NavLink href={back.href} className="inline-flex items-center gap-1 font-medium text-accent underline-offset-4 hover:underline">
              <ArrowLeft className="size-3.5 shrink-0" /> {back.label}
            </NavLink>
          ) : (
            <span />
          )}
          {name &&
            (home ? (
              <Link href="/" prefetch={false} aria-label={`${siteName} home`} className="inline-flex items-center gap-1.5 font-display underline-offset-4 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-display">{name}</span>
            ))}
        </nav>
        {children}
      </div>
    </main>
  );
}

/**
 * One way to add it. `web` ones are other sites, so they open in a new tab and this page stays
 * put. The others hand off to the calendar app without leaving, and a new tab would only leave a
 * blank one behind. rel and the pages' referrer setting keep their secret addresses from those sites.
 */
export function CalendarOption({ href, primary, web, className, children }: { href: string; primary?: boolean; web?: boolean; className?: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener noreferrer" {...(web ? { target: "_blank" } : {})} className={buttonClass(primary ? "primary" : "secondary", `w-full ${className ?? ""}`)}>
      {children}
      {web && (
        <>
          <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
}
