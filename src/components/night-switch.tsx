import Link from "next/link";
import clsx from "clsx";
import { NIGHT_NAMES } from "@/config";
import type { Night } from "@/db/enums";

/** Reads `?night=` from a page's search params; anything else means no particular night. */
export function nightParam(value: string | string[] | undefined): Night | undefined {
  return value === "core" || value === "casual" ? value : undefined;
}

/**
 * Switches a page between the core group's nights and the casual night, as links so the
 * server loads that night's data. `all` adds a first tab for both together.
 */
export function NightSwitch({ current, href, all }: { current: Night | undefined; href: (night: Night | undefined) => string; all?: string }) {
  const tab = (active: boolean) =>
    clsx("rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink");
  const tabs: [Night | undefined, string][] = [...(all ? [[undefined, all] as [undefined, string]] : []), ["core", NIGHT_NAMES.core], ["casual", NIGHT_NAMES.casual]];
  return (
    <nav aria-label="Which kind of event" className="flex w-fit gap-1 rounded-lg border border-line bg-table p-1">
      {tabs.map(([night, label]) => (
        <Link key={label} href={href(night)} aria-current={current === night ? "page" : undefined} className={tab(current === night)}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
