/**
 * How someone hears about an event: in Discord when it reaches them there, otherwise by email
 * when the site sends it and they want it. Never both. Pure, so it's tested.
 */

import type { Access } from "@/db/enums";
import { isPlaceholderEmail } from "./join";

export type Reachable = { discordId: string | null; email: string; emailVerified: boolean; emailUpdates: boolean; access: Access };

/**
 * Whether to email someone. `inDiscord` is whether this was said in Discord at all: posted for
 * that kind of event, or for a message to one person, the bot being there to send it.
 */
export function byEmail(p: Reachable, inDiscord: boolean) {
  if (inDiscord && p.discordId) return false;
  // An address nobody's confirmed might be someone else's
  return p.access !== "removed" && p.emailUpdates && p.emailVerified && !isPlaceholderEmail(p.email);
}
