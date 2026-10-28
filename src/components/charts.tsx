import clsx from "clsx";
import { CASUAL_NIGHT, GROUP_NIGHTS, NIGHT_NAMES } from "@/config";
import type { MeepleColor, Night } from "@/db/enums";
import { monthLabel } from "@/lib/nights";
import { Meeple } from "./ui";

const NIGHT_FILL: Record<Night, string> = { core: "bg-night-core", casual: "bg-night-casual" };

export type ByNight = Record<Night, number>;

/** Both series are always named, so color is never the only cue. A group with one kind of night has one series and no legend. */
function NightLegend({ totals, unit }: { totals?: ByNight; unit?: string }) {
  if (!CASUAL_NIGHT) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
      {GROUP_NIGHTS.map((n) => (
        <li key={n} className="flex items-center gap-1.5">
          <span className={clsx("size-2.5 rounded-[3px]", NIGHT_FILL[n])} aria-hidden />
          {NIGHT_NAMES[n]}
          {totals && (
            <span className="tabular font-medium text-ink">
              {totals[n]}
              {unit && <span className="font-normal text-slate"> {unit}</span>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Plays per month ("2025-11"), core nights stacked under casual ones; hover or focus a column for
 * both counts. Every other month is labeled, with the year on the first and wherever it changes.
 */
export function MonthColumns({ data }: { data: ({ month: string } & ByNight)[] }) {
  const max = Math.max(1, ...data.map((d) => d.core + d.casual));
  const labeled = data.filter((_, i) => i % 2 === data.length % 2).map((d) => d.month);
  const axisLabel = (month: string) => {
    const i = labeled.indexOf(month);
    if (i < 0) return "";
    return monthLabel(month, i === 0 || labeled[i - 1].slice(0, 4) !== month.slice(0, 4));
  };
  const totals = { core: sum(data.map((d) => d.core)), casual: sum(data.map((d) => d.casual)) };
  return (
    <figure>
      <NightLegend totals={totals} unit="plays" />
      <div className="flex h-36 items-end gap-[2px] border-b border-line" role="list">
        {data.map((d) => {
          const total = d.core + d.casual;
          return (
            <div
              key={d.month}
              role="listitem"
              tabIndex={0}
              aria-label={`${monthLabel(d.month, true)}: ${CASUAL_NIGHT ? byNight(d, ", ") : plays(total)}`}
              className="group relative flex h-full flex-1 flex-col justify-end outline-none"
            >
              {/* Casual on top, a 2px gap of card between the two */}
              <div className="flex flex-col gap-[2px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80" style={{ height: `${(total / max) * 100}%` }}>
                {(["casual", "core"] as const).map((n, i, order) =>
                  d[n] ? (
                    <div
                      key={n}
                      className={clsx(NIGHT_FILL[n], order.slice(0, i).every((above) => !d[above]) && "rounded-t-[4px]")}
                      style={{ flexGrow: d[n], minHeight: 3 }}
                    />
                  ) : null,
                )}
              </div>
              <span className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-card group-hover:block group-focus-visible:block">
                <span className="block font-semibold">{monthLabel(d.month, true)}</span>
                {!total ? "No plays" : CASUAL_NIGHT ? byNight(d) : plays(total)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[0.65rem] text-slate">
        {data.map((d) => (
          <span key={d.month} className="flex-1 text-center whitespace-nowrap">
            {axisLabel(d.month)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** One bar per person, core nights then casual nights, labeled directly with the total. */
export function AttendanceBars({ rows }: { rows: ({ id: number; name: string; color: MeepleColor | null } & ByNight)[] }) {
  const max = Math.max(1, ...rows.map((r) => r.core + r.casual));
  return (
    <figure>
      <NightLegend />
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const total = r.core + r.casual;
          return (
            <li
              key={r.id}
              aria-label={`${r.name}: ${CASUAL_NIGHT ? byNight(r, ", ") : `${total} ${total === 1 ? "event" : "events"}`}`}
              className="grid grid-cols-[minmax(0,7rem)_1fr_4.5rem] items-center gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Meeple color={r.color} className="size-4" />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="flex h-3 gap-[2px] rounded-r-[4px] bg-line/50" title={CASUAL_NIGHT ? byNight(r, ", ") : undefined}>
                {GROUP_NIGHTS.map((n) =>
                  r[n] ? (
                    <span
                      key={n}
                      className={clsx("block h-full", NIGHT_FILL[n], (n === "casual" || !r.casual) && "rounded-r-[4px]")}
                      style={{ width: `${(r[n] / max) * 100}%` }}
                    />
                  ) : null,
                )}
              </span>
              <span className="tabular text-right text-slate">
                <span className="font-semibold text-ink">{total}</span> {total === 1 ? "event" : "events"}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** "Strategy night 3 · Casual night 1": each night by its name, so the counts never need a plural */
const byNight = (n: ByNight, sep = " · ") => GROUP_NIGHTS.map((k) => `${NIGHT_NAMES[k]} ${n[k]}`).join(sep);
const plays = (n: number) => `${n} ${n === 1 ? "play" : "plays"}`;
