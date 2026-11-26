"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/ui";

/** Where someone is in getting set up, while they aren't yet */
export type SetupGlance = { done: number; total: number; next: string };

const label = "Setup progress";

/**
 * The sidebar's: on every page until setup is done, so a step that sends someone to Rankings
 * or BGG's suggestions doesn't lose them the checklist. It moves on as each step is done.
 */
export function SetupCard({ setup }: { setup: SetupGlance }) {
  const here = usePathname() === "/welcome";
  return (
    <Link
      href="/welcome"
      aria-current={here ? "page" : undefined}
      className="mb-3 block space-y-2 rounded-lg bg-white/10 p-3 text-sm hover:bg-white/15 aria-[current=page]:bg-white/15"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">Get set up</span>
        <span className="tabular text-xs text-felt-ink/75">
          {setup.done} of {setup.total}
        </span>
      </span>
      <ProgressBar done={setup.done} total={setup.total} label={label} className="bg-black/25" fill="bg-meeple-yellow" />
      <span className="block text-xs text-felt-ink/75">Next: {setup.next.toLowerCase()}</span>
    </Link>
  );
}

/** Phones: a strip under the header instead. Home and the setup page already show how far along they are */
export function SetupStrip({ setup }: { setup: SetupGlance }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/welcome") return null;
  return (
    <Link href="/welcome" className="flex items-center gap-3 border-t border-white/10 bg-felt px-4 py-2 text-sm text-felt-ink md:hidden">
      <span className="shrink-0 font-semibold">Get set up</span>
      <ProgressBar done={setup.done} total={setup.total} label={label} className="bg-black/25" fill="bg-meeple-yellow" />
      <span className="tabular shrink-0 text-xs text-felt-ink/75">
        {setup.done} of {setup.total}
      </span>
      <ChevronRight className="-mr-1 size-4 shrink-0 text-felt-ink/75" aria-hidden />
    </Link>
  );
}
