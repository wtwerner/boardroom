/**
 * How someone hears about an event: in Discord when it reaches them there, and by email when the
 * site sends it and they want it. Someone Discord reaches is emailed too only if they asked to
 * be. Pure, so it's tested.
 */

import type { Access } from "@/db/enums";
import { isPlaceholderEmail } from "./join";

export type Reachable = { discordId: string | null; email: string; emailVerified: boolean; emailUpdates: boolean; emailToo: boolean; access: Access };

/**
 * Whether to email someone. `inDiscord` is whether this was said in Discord at all: posted for
 * that kind of event, or for a message to one person, the bot being there to send it.
 */
export function byEmail(p: Reachable, inDiscord: boolean) {
  if (inDiscord && p.discordId && !p.emailToo) return false;
  // An address confirmed on this site: one nobody has might be someone else's, and Discord's may be one they never read
  return p.access !== "removed" && p.emailUpdates && p.emailVerified && !isPlaceholderEmail(p.email);
}
