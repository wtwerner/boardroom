/**
 * Links that let someone in without Discord: an invite, a new password, or confirming an email
 * (access_link). Their tokens, how long they last, and whether one still works. Pure, so it's
 * tested; account-store.ts makes them and acts on them.
 */

import { createHash, randomBytes } from "node:crypto";
import type { LinkKind } from "@/db/enums";

const HOUR = 3_600_000;

/** How long each kind of link works for. An invite for the group's chat goes by the group's setting (GROUP_INVITE in config.ts) */
export const LINK_HOURS = { invite: 14 * 24, password: 24, email: 3 * 24 } as const;

/** A new link's secret. It's only ever in the link: the table keeps its hash */
export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const expiryFor = (hours: number, now = new Date()) => new Date(now.getTime() + hours * HOUR);

export type LinkFacts = { kind: LinkKind; once: boolean; uses: number; expiresAt: Date; closedAt: Date | null };

/** Why a link doesn't work anymore, or null when it does. `groupUses` is the most people an invite for the group's chat lets in */
export function linkProblem(l: LinkFacts, groupUses: number, now = new Date()): "used" | "expired" | "closed" | null {
  if (l.closedAt) return "closed";
  if (l.once && l.uses > 0) return "used";
  if (!l.once && l.uses >= groupUses) return "used";
  return l.expiresAt.getTime() <= now.getTime() ? "expired" : null;
}

/** Where each kind of link goes */
export const linkPath = (kind: LinkKind, token: string) => `/${{ invite: "join", password: "password", email: "confirm" }[kind]}/${token}`;
