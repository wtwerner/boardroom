import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import type { MeepleColor } from "@/db/enums";

const MEEPLE_FILL: Record<MeepleColor, string> = {
  red: "fill-meeple-red",
  blue: "fill-meeple-blue",
  yellow: "fill-meeple-yellow",
  green: "fill-meeple-green",
  purple: "fill-meeple-purple",
  orange: "fill-meeple-orange",
};

const MEEPLE_BG: Record<MeepleColor, string> = {
  red: "bg-meeple-red",
  blue: "bg-meeple-blue",
  yellow: "bg-meeple-yellow",
  green: "bg-meeple-green",
  purple: "bg-meeple-purple",
  orange: "bg-meeple-orange",
};

export function Meeple({ color, className }: { color: MeepleColor | null; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={clsx("shrink-0", className ?? "size-4")}>
      <path
        className={color ? MEEPLE_FILL[color] : "fill-slate/50"}
        d="M12 2.5a3.2 3.2 0 0 1 3.2 3.2c0 1-.4 1.8-1 2.4 2.9.4 7.3 1.6 7.3 3.6 0 1.2-1.6 1.6-3.6 1.4l2.6 6.4c.3.8-.2 1.5-1 1.5h-4.2L12 15.6 9.7 21H5.5c-.8 0-1.3-.7-1-1.5l2.6-6.4c-2 .2-3.6-.2-3.6-1.4 0-2 4.4-3.2 7.3-3.6-.6-.6-1-1.4-1-2.4A3.2 3.2 0 0 1 12 2.5Z"
      />
    </svg>
  );
}

export function PlayerChip({
  name,
  color,
  size = "sm",
}: {
  name: string;
  color: MeepleColor | null;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-line bg-card",
        size === "sm" ? "py-0.5 pr-2 pl-1 text-xs" : "py-1 pr-3 pl-1.5 text-sm",
      )}
    >
      <Meeple color={color} className={size === "sm" ? "size-3.5" : "size-4"} />
      {name}
    </span>
  );
}

export function Avatar({ src, name, color, className }: { src: string | null; name: string; color: MeepleColor | null; className?: string }) {
  return (
    <span className={clsx("relative inline-block shrink-0 rounded-full", className ?? "size-8")}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-felt-soft text-xs font-semibold">{name[0]}</span>
      )}
      <span className={clsx("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card", color ? MEEPLE_BG[color] : "bg-slate")} />
    </span>
  );
}

const COVER_DIMS = { sm: "size-10", md: "size-16", lg: "size-28", xl: "size-40 sm:size-48", fluid: "aspect-square w-full" } as const;
const COVER_PX = { sm: 40, md: 64, lg: 112, xl: 192 } as const;

/**
 * Box art. Small sizes use BGG's thumbnail as-is. Large ones resize BGG's full image
 * through Next's image optimizer and show the whole box (no cropping) over a
 * blurred wash of its own art. `fluid` fills its container's width; pass `sizes`.
 */
export function GameCover({
  src,
  image,
  name,
  size = "md",
  sizes,
  className,
}: {
  src: string | null;
  /** Full-size image, used for lg, xl and fluid */
  image?: string | null;
  name: string;
  size?: keyof typeof COVER_DIMS;
  sizes?: string;
  className?: string;
}) {
  const large = size === "lg" || size === "xl" || size === "fluid";
  const url = large ? (image ?? src) : (src ?? image);
  return (
    <span
      className={clsx(
        "relative block shrink-0 overflow-hidden bg-felt-soft",
        large ? "rounded-lg ring-1 ring-ink/10" : "rounded-md ring-1 ring-ink/15",
        COVER_DIMS[size],
        className,
      )}
    >
      {url && large ? (
        <>
          <Image src={url} alt="" aria-hidden fill sizes={sizes ?? `${COVER_PX[size as "lg" | "xl"] ?? 200}px`} className="scale-125 object-cover opacity-50 blur-xl saturate-150" />
          <Image
            src={url}
            alt=""
            fill
            sizes={sizes ?? `${COVER_PX[size as "lg" | "xl"] ?? 200}px`}
            className="object-contain p-[7%] drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]"
          />
        </>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span
          aria-hidden
          className={clsx(
            "grid size-full place-items-center p-1 text-center font-display leading-tight text-accent",
            size === "sm" ? "text-xs" : size === "md" ? "text-base" : "text-2xl",
          )}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

/** "Brass: Birmingham" → "BB", "The Crew: The Quest…" → "C" */
function initials(name: string) {
  const words = name
    .split(":")[0]
    .split(/\s+/)
    .filter((w) => w && !/^(the|a|an|of|and|&)$/i.test(w));
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Marks a member who signed up in the last couple of weeks. */
export function NewBadge() {
  return <span className="rounded-full bg-meeple-yellow/25 px-1.5 py-px text-[0.65rem] font-semibold tracking-wide uppercase">New</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("min-w-0", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-wide text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** How far through something someone is, as a filling bar */
export function ProgressBar({ done, total, label, className }: { done: number; total: number; label: string; className?: string }) {
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={label}
      className={clsx("block h-2 w-full overflow-hidden rounded-full bg-line", className)}
    >
      <span className="block h-full rounded-full bg-felt" style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
    </span>
  );
}

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-xl border border-line bg-card", className)} {...props} />;
}

/** `className` can resize the button: twMerge lets its padding and text size replace the defaults. */
export const buttonClass = (variant: "primary" | "secondary" | "ghost" = "primary", className?: string) =>
  twMerge(
    clsx(
      "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-transform select-none",
      "disabled:pointer-events-none disabled:opacity-50 active:translate-y-0.5 active:shadow-none",
      variant === "primary" && "border border-ink/80 bg-felt text-felt-ink shadow-token",
      variant === "secondary" && "border border-ink/80 bg-card text-ink shadow-token",
      variant === "ghost" && "text-slate hover:bg-felt-soft hover:text-ink",
    ),
    className,
  );

export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={clsx("text-sm font-medium text-accent underline-offset-4 hover:underline", className)} {...props} />;
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-slate", className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-line/60", className)} />;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? opts : { ...opts, year: "numeric" });
}

export function playtime(min: number | null, max: number | null) {
  if (!min && !max) return null;
  if (!max || min === max) return `${min ?? max} min`;
  return `${min}–${max} min`;
}

export function playerRange(min: number | null, max: number | null) {
  if (!min && !max) return null;
  if (!max || min === max) return `${min ?? max}p`;
  return `${min}–${max}p`;
}

/** BGG's best player counts: [3, 4] → "best 3–4", [2, 4] → "best 2, 4" */
export function bestAt(counts: number[] | null) {
  if (!counts?.length) return null;
  const runs: number[][] = [];
  for (const n of [...counts].sort((a, b) => a - b)) {
    const run = runs.at(-1);
    if (run && n === run.at(-1)! + 1) run.push(n);
    else runs.push([n]);
  }
  return `best ${runs.map((r) => (r.length > 1 ? `${r[0]}–${r.at(-1)}` : `${r[0]}`)).join(", ")}`;
}
