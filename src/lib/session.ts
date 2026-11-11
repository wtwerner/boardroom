import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { CASUAL_NIGHT, DEMO } from "@/config";
import { db, schema } from "@/db";
import type { Access, MeepleColor } from "@/db/enums";
import { auth } from "./auth";
import { loadSettings } from "./settings-store";

const getSession = cache(async () => {
  // A prefetch renders the page ahead of a click and leaves uncached queries hanging. Stop here
  // instead, so Better Auth never starts a lookup it would then log as a failed query.
  await connection();
  return auth.api.getSession({ headers: await headers() });
});

export type CurrentUser = {
  id: string;
  name: string;
  image: string | null;
  bggUsername: string | null;
  playerId: number | null;
  color: MeepleColor | null;
  /** Can change the group's settings (see canManageGroup) */
  isAdmin: boolean;
  /**
   * A member of the core group, or a casual account (ACCESS in db/enums.ts). A member previewing
   * the casual side is casual here, so everything they see and can do is a casual account's.
   */
  access: Exclude<Access, "removed">;
  /** A member seeing the site as a casual account would (PREVIEW_COOKIE) */
  previewing: boolean;
};

/** Set while a member is seeing the site as a casual account would. Settings turns it on; the banner turns it off */
export const PREVIEW_COOKIE = "casual-preview";

/** The signed-in member, or a redirect to /sign-in. Call from every page and action. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  // Whatever runs next reads the group's settings, so have the latest in place first
  const [session, jar] = await Promise.all([getSession(), cookies(), loadSettings({ fresh: true })]);
  if (!session) redirect("/sign-in");
  const stored = (session.user as { access?: Access }).access;
  // Removing someone ends their sessions; this catches one that's still on its way out
  if (stored === "removed") redirect("/sign-in?error=missing_role");
  // Anything but a casual account is a member, as every account was before there were casual ones
  const access = stored === "casual" ? "casual" : "member";
  // A casual account has nothing to see once the group has no casual night (signInAccess)
  if (access === "casual" && !CASUAL_NIGHT) redirect("/sign-in?error=missing_role");
  // There's only a casual side to preview while the group has a casual night
  const previewing = access === "member" && CASUAL_NIGHT && jar.get(PREVIEW_COOKIE)?.value === "on";
  const p = await db.query.player.findFirst({
    where: eq(schema.player.userId, session.user.id),
    columns: { id: true, color: true },
  });
  return {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
    bggUsername: (session.user as { bggUsername?: string | null }).bggUsername ?? null,
    playerId: p?.id ?? null,
    color: p?.color ?? null,
    isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin),
    access: previewing ? "casual" : access,
    previewing,
  };
});

/**
 * The signed-in member of the core group. Call from every action a casual account can't take:
 * anything that changes what the whole group shares, or is about the core group's nights.
 * The site never offers those to a casual account, so this only stops a hand-made request.
 */
export async function requireMember(): Promise<CurrentUser> {
  const me = await requireUser();
  if (me.access !== "member") throw new Error("That isn't something you can do here.");
  return me;
}

/**
 * The signed-in member, on a page only members see. A casual account gets the not-found page,
 * as if the page weren't there, rather than being told it's for someone else.
 */
export async function requireMemberPage(): Promise<CurrentUser> {
  const me = await requireUser();
  if (me.access !== "member") notFound();
  return me;
}

/**
 * Whether the signed-in member can change the group's settings and who its admins are: they're
 * an admin, or nobody is yet (a new site, or the last admin left), so someone can make themselves one.
 */
export const canManageGroup = cache(async () => {
  const me = await requireUser();
  if (me.access !== "member") return false;
  if (me.isAdmin) return true;
  const [admins] = await db.select({ n: count() }).from(schema.user).where(eq(schema.user.isAdmin, true));
  return admins.n === 0;
});

/**
 * The signed-in member, if they can change the group's settings. Call from every action that does.
 * Nobody can on a demo: everyone trying it shares one group, so one visitor's site name or time
 * zone would be everyone's until the nightly reset.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const me = await requireMember();
  if (DEMO) throw new Error("You can't change group settings on the demo.");
  if (!(await canManageGroup())) throw new Error("Only the group's admins can change that.");
  return me;
}
