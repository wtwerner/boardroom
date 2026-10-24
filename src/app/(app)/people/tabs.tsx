import Link from "next/link";
import clsx from "clsx";

/** Who's in the group, and what the group likes. */
export function PeopleTabs({ current }: { current: "members" | "taste" }) {
  const tab = (active: boolean) =>
    clsx(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-card text-ink shadow-token" : "text-slate hover:text-ink",
    );
  return (
    <nav aria-label="People views" className="flex gap-1 rounded-lg border border-line bg-table p-1">
      <Link href="/people" aria-current={current === "members" ? "page" : undefined} className={tab(current === "members")}>
        Members
      </Link>
      <Link href="/people/taste" aria-current={current === "taste" ? "page" : undefined} className={tab(current === "taste")}>
        Group taste
      </Link>
    </nav>
  );
}
