/**
 * The key in an email's "Stop emails about events" link: whose they are, signed, so the link
 * works without signing in but nobody can turn off someone else's. Pure, so it's tested.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const signature = (userId: string, secret: string) => createHmac("sha256", secret).update(`email-stop:${userId}`).digest("base64url").slice(0, 22);

export const signStopKey = (userId: string, secret: string) => `${userId}.${signature(userId, secret)}`;

/** Whose key it is, or null when it isn't one we signed */
export function readStopKey(key: string, secret: string): string | null {
  const match = /^([\w-]{1,64})\.([\w-]{22})$/.exec(key);
  if (!match) return null;
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(signature(match[1], secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? match[1] : null;
}
