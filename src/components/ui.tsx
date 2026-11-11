import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import type { MeepleColor } from "@/db/enums";

/**
 * Each color's classes, written out so Tailwind finds them. Black and white meeples get an outline,
 * being about the color of a card in one theme or the other; `light` ones take a dark letter in either theme.
 */
const MEEPLE_CLASS: Record<MeepleColor, { fill: string; bg: string; border: string; light?: boolean }> = {
  red: { fill: "fill-meeple-red", bg: "bg-meeple-red", border: "border-meeple-red" },
  blue: { fill: "fill-meeple-blue", bg: "bg-meeple-blue", border: "border-meeple-blue" },
  yellow: { fill: "fill-meeple-yellow", bg: "bg-meeple-yellow", border: "border-meeple-yellow", light: true },
  green: { fill: "fill-meeple-green", bg: "bg-meeple-green", border: "border-meeple-green" },
  purple: { fill: "fill-meeple-purple", bg: "bg-meeple-purple", border: "border-meeple-purple" },
  orange: { fill: "fill-meeple-orange", bg: "bg-meeple-orange", border: "border-meeple-orange", light: true },
  black: { fill: "fill-meeple-black stroke-slate", bg: "bg-meeple-black", border: "border-meeple-black" },
  white: { fill: "fill-meeple-white stroke-slate", bg: "bg-meeple-white", border: "border-meeple-white", light: true },
  pink: { fill: "fill-meeple-pink", bg: "bg-meeple-pink", border: "border-meeple-pink" },
  teal: { fill: "fill-meeple-teal", bg: "bg-meeple-teal", border: "border-meeple-teal" },
  brown: { fill: "fill-meeple-brown", bg: "bg-meeple-brown", border: "border-meeple-brown" },
};

export function Meeple({ color, className }: { color: MeepleColor | null; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={clsx("shrink-0", className ?? "size-4")}>
      <path
        className={color ? MEEPLE_CLASS[color].fill : "fill-slate/50"}
        strokeWidth={1}
        d="M12 2c2.486 0 3.713 1.766 3.955 4.1l.01.124l.129.036c3.17.928 5.754 2.487 5.9 4.556L22 11c0 1.427-1.297 2.322-2.871 2.733l-.201.049l.026.03c.244.276.532.603.7.797l.057.066c.49.573.884 1.073 1.216 1.56C21.617 17.245 22 18.139 22 19a2 2 0 0 1-2 2h-5c-1.043 0-1.344-.453-2.394-2.553c-.29-.58-.448-.882-.593-1.118L12 17.307l-.013.022c-.129.21-.268.472-.5.935l-.093.183C10.344 20.547 10.043 21 9 21H4a2 2 0 0 1-2-2c0-.86.384-1.755 1.073-2.765a18 18 0 0 1 1.216-1.56c.152-.178.482-.553.757-.863l.025-.03l-.2-.049c-1.506-.393-2.758-1.23-2.864-2.55L2 11c0-2.16 2.643-3.785 5.906-4.74l.128-.036l.011-.124c.235-2.26 1.394-3.99 3.726-4.095z"
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

/** Someone's picture by their name (People, their page, the menu): a Face, bigger */
export function Avatar({ src, name, color, className }: { src: string | null; name: string; color: MeepleColor | null; className?: string }) {
  return <Face src={src} name={name} color={color} className={twMerge("size-8 border-2", className)} />;
}

/**
 * Someone's face, for where nothing else says who they are: a stack of owners, a chance for each
 * person. Their Discord picture in a ring of their meeple color, or without one their initial on
 * it. Colors repeat, so a meeple alone only does beside a name (PlayerChip).
 */
export function Face({ src, name, color, className }: { src: string | null; name: string; color: MeepleColor | null; className?: string }) {
  const c = color ? MEEPLE_CLASS[color] : null;
  return (
    <span
      className={twMerge(
        "inline-block size-5 shrink-0 overflow-hidden rounded-full border-[1.5px]",
        c ? c.border : "border-slate/50",
        !src && (c ? c.bg : "bg-slate/50"),
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : (
        // Drawn, so the letter scales with the face
        <svg viewBox="0 0 20 20" aria-hidden className={clsx("size-full", c?.light ? "fill-black/75" : "fill-white")}>
          <text x="10" y="10" dominantBaseline="central" textAnchor="middle" fontSize="11" fontWeight="600">
            {name.trim()[0]?.toUpperCase()}
          </text>
        </svg>
      )}
    </span>
  );
}

/**
 * Faces overlapping, the first few and then how many more, all named on hover and for screen readers.
 * `className` sizes each face (size-5 by default).
 */
export function Faces({
  people,
  max = 4,
  label,
  className,
}: {
  people: { id: string; name: string; image: string | null; color: MeepleColor | null }[];
  max?: number;
  /** What the stack says, when it's more than their names ("Owned by …") */
  label?: string;
  className?: string;
}) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const more = people.length - shown.length;
  const said = label ?? people.map((p) => p.name).join(", ");
  return (
    <span role="img" aria-label={said} title={said} className="flex shrink-0 items-center">
      {shown.map((p) => (
        <Face key={p.id} src={p.image} name={p.name} color={p.color} className={twMerge("-ml-1.5 ring-2 ring-card first:ml-0", className)} />
      ))}
      {more > 0 && (
        <span className={twMerge("-ml-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-felt-soft text-[0.6rem] font-semibold tabular ring-2 ring-card", className)}>
          +{more}
        </span>
      )}
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

/** Marks what's only so on the demo, so it doesn't read like one of a real group's notes */
export function DemoTag() {
  return <span className="rounded-full bg-felt px-1.5 py-px text-[0.65rem] font-semibold tracking-wide text-felt-ink uppercase">Demo</span>;
}

/** A note only the demo shows: dashed felt, not the yellow of a real group's notes */
export function DemoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="note" className={twMerge("rounded-xl border border-dashed border-accent/50 bg-felt-soft px-4 py-3 text-sm", className)}>
      <DemoTag /> {children}
    </p>
  );
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
