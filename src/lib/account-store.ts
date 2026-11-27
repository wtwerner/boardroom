import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { CASUAL_NIGHT, DEMO, DISCORD_SIGN_IN, GROUP_INVITE, PASSWORD_SIGN_IN, SETUP_CODE, SITE_NAME, SITE_URL } from "@/config";
import { db, schema } from "@/db";
import type { LinkKind } from "@/db/enums";
import { LINK_HOURS, expiryFor, hashToken, linkPath, linkProblem, newToken } from "./access-links";
import { auth } from "./auth";
import { isDevLoginEnabled } from "./dev-login";
import { emailReady, sendEmail } from "./email";
import { buildEmail, confirmEmail as confirmMessage, passwordReset } from "./email-message";
import { type JoinFields, isPlaceholderEmail } from "./join";
import { linkPlayer } from "./player-link";
import { setupProblem } from "./setup-code";

/**
 * Accounts that don't come from Discord: a new site's first one, the ones people make from an
 * invite, and choosing a new password or confirming an email from a link. Errors are plain
 * sentences, shown to people as they are.
 */

const l = schema.accessLink;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Link = typeof l.$inferSelect;

const PROBLEM = {
  used: "That link has been used already. Ask for a new one.",
  expired: "That link has expired. Ask for a new one.",
  closed: "That link was turned off. Ask for a new one.",
  gone: "That link doesn't work. Make sure you copied all of it, or ask for a new one.",
};

const EMAIL_TAKEN = "There's already an account with that email. Sign in, or use another.";

async function hashPassword(password: string) {
  return (await auth.$context).password.hash(password);
}

/** One account, with its password and its player. The caller has decided it can be made */
async function createAccount(tx: Tx, f: { name: string; email: string; hash: string; access: "member" | "casual"; isAdmin?: boolean; playerId?: number | null }) {
  const taken = await tx.query.user.findFirst({ where: eq(schema.user.email, f.email), columns: { id: true } });
  if (taken) throw new Error(EMAIL_TAKEN);
  const id = randomBytes(16).toString("hex");
  // They just typed their name, so the first step of getting set up is done
  await tx.insert(schema.user).values({ id, name: f.name, email: f.email, access: f.access, isAdmin: f.isAdmin ?? false, nameChosenAt: new Date() });
  await tx.insert(schema.account).values({ id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: f.hash });
  await linkPlayer(id, f.name, null, { playerId: f.playerId, tx });
  return id;
}

// ---------------------------------------------------------------------------
// A new site
// ---------------------------------------------------------------------------

async function accountCount(tx: Tx | typeof db = db) {
  const [row] = await tx.select({ n: count() }).from(schema.user);
  return row.n;
}

/** Nobody has an account yet, and the first one is made here rather than by signing in with Discord */
export async function needsSetup() {
  return !DISCORD_SIGN_IN && !DEMO && (await accountCount()) === 0;
}

/** Whether a new site asks for its setup code: not in local development */
export const asksForCode = () => !isDevLoginEnabled();

/** A new site's first account, which is its admin */
export async function setupSite(f: JoinFields, code: string) {
  const facts = { discordSignIn: DISCORD_SIGN_IN, demo: DEMO, dev: isDevLoginEnabled(), code: SETUP_CODE, given: code };
  // Checked before the work of hashing, and again once nobody else can be making one
  const problem = setupProblem({ ...facts, accounts: await accountCount() });
  if (problem) throw new Error(problem);
  const hash = await hashPassword(f.password);
  await db.transaction(async (tx) => {
    const late = setupProblem({ ...facts, accounts: await accountCount(tx) });
    if (late) throw new Error(late);
    await createAccount(tx, { name: f.name, email: f.email, hash, access: "member", isAdmin: true });
  });
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

type NewLink = Pick<typeof l.$inferInsert, "kind" | "access" | "label" | "once" | "playerId" | "userId" | "email" | "createdBy">;

/** A new link, as a path. Its token isn't kept, so this is the only time it can be shown */
async function makeLink(values: NewLink, hours: number) {
  const token = newToken();
  // Long-dead links go as new ones are made, so the table stays small
  await db.delete(l).where(lt(l.expiresAt, expiryFor(-30 * 24)));
  await db.insert(l).values({ ...values, tokenHash: hashToken(token), expiresAt: expiryFor(hours) });
  return linkPath(values.kind, token);
}

/** A link as its page sees it: what it's for, or why it doesn't work */
export async function readLink(kind: LinkKind, token: string): Promise<{ link: Link; problem: null } | { link: null; problem: string }> {
  const link = await db.query.accessLink.findFirst({ where: and(eq(l.tokenHash, hashToken(token)), eq(l.kind, kind)) });
  if (!link) return { link: null, problem: PROBLEM.gone };
  const problem = linkProblem(link, GROUP_INVITE.people);
  return problem ? { link: null, problem: PROBLEM[problem] } : { link, problem: null };
}

/** Use a link up, unless someone else just did. False when it's no longer any good */
async function claimLink(tx: Tx, id: number) {
  const claimed = await tx
    .update(l)
    .set({ uses: sql`${l.uses} + 1` })
    .where(and(eq(l.id, id), isNull(l.closedAt), gt(l.expiresAt, new Date()), or(and(eq(l.once, true), eq(l.uses, 0)), and(eq(l.once, false), lt(l.uses, GROUP_INVITE.people)))))
    .returning({ id: l.id });
  return claimed.length > 0;
}

/** An invite: for one person (perhaps one in past plays), or for everyone in a chat */
export async function makeInvite(f: { access: "member" | "casual"; group: boolean; label: string | null; playerId: number | null }, createdBy: string) {
  if (!PASSWORD_SIGN_IN) throw new Error('Turn on "People can join without Discord" on Group settings first.');
  if (f.access === "casual" && !CASUAL_NIGHT) throw new Error("There's no casual night for them to see.");
  if (f.playerId) {
    if (f.group) throw new Error("An invite for someone in past plays is for one person.");
    const player = await db.query.player.findFirst({ where: eq(schema.player.id, f.playerId), columns: { userId: true } });
    if (!player) throw new Error("They're not in the play log anymore.");
    if (player.userId) throw new Error("They have an account already.");
    // Only one person is that player, so only their newest invite works
    await db.update(l).set({ closedAt: new Date() }).where(and(eq(l.kind, "invite"), eq(l.playerId, f.playerId), isNull(l.closedAt)));
  }
  return makeLink({ kind: "invite", access: f.access, label: f.label, once: !f.group, playerId: f.playerId, createdBy }, f.group ? GROUP_INVITE.days * 24 : LINK_HOURS.invite);
}

/** Invites that still work, newest first, for the admins' page */
export async function openInvites() {
  const rows = await db
    .select({ id: l.id, kind: l.kind, access: l.access, label: l.label, once: l.once, uses: l.uses, expiresAt: l.expiresAt, closedAt: l.closedAt, player: schema.player.name, by: schema.user.name })
    .from(l)
    .leftJoin(schema.player, eq(schema.player.id, l.playerId))
    .leftJoin(schema.user, eq(schema.user.id, l.createdBy))
    .where(and(eq(l.kind, "invite"), isNull(l.closedAt), gt(l.expiresAt, new Date())))
    .orderBy(desc(l.id));
  return rows.filter((r) => linkProblem(r, GROUP_INVITE.people) === null);
}

export async function closeInvite(id: number) {
  await db.update(l).set({ closedAt: new Date() }).where(and(eq(l.id, id), eq(l.kind, "invite"), isNull(l.closedAt)));
}

/** Make an account from an invite. Its player is the invite's, or the one with their name nobody has claimed */
export async function acceptInvite(token: string, f: JoinFields) {
  if (!PASSWORD_SIGN_IN) throw new Error("This site isn't taking new accounts this way.");
  const { link, problem } = await readLink("invite", token);
  if (!link) throw new Error(problem);
  if (link.access === "casual" && !CASUAL_NIGHT) throw new Error(PROBLEM.closed);
  const hash = await hashPassword(f.password);
  const userId = await db.transaction(async (tx) => {
    if (!(await claimLink(tx, link.id))) throw new Error(PROBLEM.used);
    return createAccount(tx, { name: f.name, email: f.email, hash, access: link.access === "casual" ? "casual" : "member", playerId: link.playerId });
  });
  await sendConfirmation(userId);
}

// ---------------------------------------------------------------------------
// Passwords and emails
// ---------------------------------------------------------------------------

/** A link for someone to choose a new password, or their first: an admin gives it to them, or it's emailed */
export async function makePasswordLink(userId: string, createdBy: string | null) {
  if (!PASSWORD_SIGN_IN) throw new Error('Turn on "People can join without Discord" on Group settings first.');
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { access: true } });
  if (!u || u.access === "removed") throw new Error("They're not on the site.");
  // Only the newest works
  await db.update(l).set({ closedAt: new Date() }).where(and(eq(l.kind, "password"), eq(l.userId, userId), isNull(l.closedAt)));
  return makeLink({ kind: "password", userId, createdBy }, LINK_HOURS.password);
}

/** Who a password link is for. `needsEmail`: their Discord account had no email, so they give one to sign in with */
export async function passwordLinkFor(token: string) {
  if (!PASSWORD_SIGN_IN) return { problem: "This site doesn't use passwords. Sign in with Discord." } as const;
  const { link, problem } = await readLink("password", token);
  if (!link?.userId) return { problem: problem ?? PROBLEM.gone } as const;
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, link.userId) });
  if (!u || u.access === "removed") return { problem: PROBLEM.gone } as const;
  return { problem: null, link, user: { id: u.id, name: u.name, email: u.email, needsEmail: isPlaceholderEmail(u.email) } } as const;
}

/** Choose a new password from a link. Everywhere they were signed in is signed out. Returns the email to sign in with */
export async function choosePassword(token: string, password: string, newEmail: string | null) {
  const found = await passwordLinkFor(token);
  if (found.problem !== null) throw new Error(found.problem);
  const { link, user } = found;
  if (user.needsEmail && !newEmail) throw new Error("Give an email address to sign in with.");
  const email = user.needsEmail ? newEmail! : user.email;
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    if (!(await claimLink(tx, link.id))) throw new Error(PROBLEM.used);
    if (user.needsEmail) {
      if (await tx.query.user.findFirst({ where: eq(schema.user.email, email), columns: { id: true } })) throw new Error(EMAIL_TAKEN);
      await tx.update(schema.user).set({ email, emailVerified: false }).where(eq(schema.user.id, user.id));
    }
    const had = await tx
      .update(schema.account)
      .set({ password: hash })
      .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "credential")))
      .returning({ id: schema.account.id });
    if (!had.length) await tx.insert(schema.account).values({ id: randomBytes(16).toString("hex"), accountId: user.id, providerId: "credential", userId: user.id, password: hash });
    await tx.delete(schema.session).where(eq(schema.session.userId, user.id));
  });
  if (user.needsEmail) await sendConfirmation(user.id);
  return email;
}

/** How long before another email of the same kind goes to someone */
const EMAIL_EVERY_MS = 5 * 60_000;

async function sentLately(kind: LinkKind, userId: string) {
  const recent = await db.query.accessLink.findFirst({
    where: and(eq(l.kind, kind), eq(l.userId, userId), gt(l.createdAt, new Date(Date.now() - EMAIL_EVERY_MS))),
    columns: { id: true },
  });
  return Boolean(recent);
}

/**
 * Email someone who forgot their password a link. Only to an address they've confirmed, so a
 * mistyped one doesn't hand a stranger the account, and only for someone who uses a password.
 * Says nothing about whether there is an account.
 */
export async function sendPasswordReset(email: string) {
  if (!emailReady() || !PASSWORD_SIGN_IN) return;
  const u = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (!u || !u.emailVerified || u.access === "removed" || isPlaceholderEmail(u.email)) return;
  const uses = await db.query.account.findFirst({ where: and(eq(schema.account.userId, u.id), eq(schema.account.providerId, "credential")), columns: { id: true } });
  if (!uses || (await sentLately("password", u.id))) return;
  const path = await makePasswordLink(u.id, null);
  await sendEmail(u.email, buildEmail(passwordReset({ name: u.name, siteName: SITE_NAME }, { url: `${SITE_URL}${path}` }), { siteName: SITE_NAME }));
}

/** Email someone a link to confirm their address. False when the site can't, or just did */
export async function sendConfirmation(userId: string) {
  if (!emailReady()) return false;
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!u || u.emailVerified || isPlaceholderEmail(u.email) || (await sentLately("email", userId))) return false;
  const password = await db.query.account.findFirst({ where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")), columns: { id: true } });
  const path = await makeLink({ kind: "email", userId, email: u.email }, LINK_HOURS.email);
  return sendEmail(u.email, buildEmail(confirmMessage({ name: u.name, siteName: SITE_NAME, password: Boolean(password) }, { url: `${SITE_URL}${path}` }), { siteName: SITE_NAME }));
}

/** Their address is theirs. One they've changed since doesn't count */
export async function confirmEmailFrom(token: string) {
  const { link, problem } = await readLink("email", token);
  if (!link?.userId || !link.email) throw new Error(problem ?? PROBLEM.gone);
  const { userId, email } = link;
  await db.transaction(async (tx) => {
    if (!(await claimLink(tx, link.id))) throw new Error(PROBLEM.used);
    const done = await tx
      .update(schema.user)
      .set({ emailVerified: true })
      .where(and(eq(schema.user.id, userId), eq(schema.user.email, email)))
      .returning({ id: schema.user.id });
    if (!done.length) throw new Error("That address isn't the one on your account anymore.");
  });
}

/** A new email for someone who signs in with a password, who gives it again to change it */
export async function changeEmail(userId: string, email: string, password: string) {
  const [u, account] = await Promise.all([
    db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { email: true } }),
    db.query.account.findFirst({ where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")), columns: { password: true } }),
  ]);
  if (!u || !account?.password) throw new Error("You sign in with Discord, so your email is Discord's.");
  if (!(await (await auth.$context).password.verify({ hash: account.password, password }))) throw new Error("That isn't your password.");
  if (u.email === email) return;
  if (await db.query.user.findFirst({ where: eq(schema.user.email, email), columns: { id: true } })) throw new Error("There's already an account with that email.");
  await db.transaction(async (tx) => {
    await tx.update(schema.user).set({ email, emailVerified: false }).where(eq(schema.user.id, userId));
    // Links emailed to the old address stop working with it
    await tx.update(l).set({ closedAt: new Date() }).where(and(eq(l.userId, userId), isNull(l.closedAt)));
  });
  await sendConfirmation(userId);
}
