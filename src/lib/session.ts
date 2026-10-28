import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MeepleColor } from "@/db/enums";
import { auth } from "./auth";

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
};

/** The signed-in member, or a redirect to /sign-in. Call from every page and action. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await getSession();
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
  };
});
