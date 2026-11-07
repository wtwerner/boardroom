import type { ReactNode } from "react";
import { CalendarPlus } from "lucide-react";
import { Meeple, buttonClass } from "@/components/ui";

/** A calendar page opens from Discord as often as from the site, so it stands alone without the site's menus */
export function CalendarShell({ siteName, children }: { siteName?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-table px-4 py-8 text-ink">
      <div className="mx-auto w-full max-w-md space-y-6">
        {siteName && (
          <p className="flex items-center gap-2 font-display text-lg">
            <Meeple color="yellow" className="size-6" />
            {siteName}
          </p>
        )}
        {children}
      </div>
    </main>
  );
}

/** One way to add it. rel="noreferrer" and the pages' referrer setting keep their secret addresses from calendar sites. */
export function CalendarOption({ href, primary, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <a href={href} rel="noreferrer" className={buttonClass(primary ? "primary" : "secondary", "flex w-full items-center justify-center gap-2")}>
      {primary && <CalendarPlus className="size-4 shrink-0" />}
      {children}
    </a>
  );
}
