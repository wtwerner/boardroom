import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "./auth";
import { readStopKey } from "./email-stop";

/** Whose a stop link is, or null for one we didn't make or someone who's gone */
export async function stopLinkFor(key: string) {
  const userId = readStopKey(key, (await auth.$context).secret);
  if (!userId) return null;
  return (await db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { id: true, email: true, emailUpdates: true } })) ?? null;
}

/** Turn off emails about events from a stop link. False when the link isn't one of ours */
export async function stopEmails(key: string) {
  const u = await stopLinkFor(key);
  if (!u) return false;
  await db.update(schema.user).set({ emailUpdates: false, emailToo: false }).where(eq(schema.user.id, u.id));
  return true;
}
