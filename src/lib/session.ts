import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { DEMO } from "@/config";
import { db, schema } from "@/db";
import type { MeepleColor } from "@/db/enums";
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
};

/** The signed-in member, or a redirect to /sign-in. Call from every page and action. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  // Whatever runs next reads the group's settings, so have the latest in place first
  const [session] = await Promise.all([getSession(), loadSettings({ fresh: true })]);
  if (!session) redirect("/sign-in");
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
  };
});

/**
 * Whether the signed-in member can change the group's settings and who its admins are: they're
 * an admin, or nobody is yet (a new site, or the last admin left), so someone can make themselves one.
 */
export const canManageGroup = cache(async () => {
  const me = await requireUser();
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
  const me = await requireUser();
  if (DEMO) throw new Error("You can't change group settings on the demo.");
  if (!(await canManageGroup())) throw new Error("Only the group's admins can change that.");
  return me;
}
