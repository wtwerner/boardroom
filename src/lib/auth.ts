import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { CASUAL_NIGHT, CASUAL_SIGN_IN, SITE_URL } from "@/config";
import { db, schema } from "@/db";
import type { Access } from "@/db/enums";
import { signInAccess } from "./access";
import { getServerMember } from "./discord";
import { discordAccountEmail } from "./discord-email";
import { pickColor } from "./meeple";
import { matchByName } from "./players";
import { loadSettings } from "./settings-store";
import type { SignInRefusal } from "./sign-in-refusal";

const REFUSAL_MESSAGE: Record<SignInRefusal, string> = {
  not_in_server: "This site is only for members of the game group's Discord server.",
  missing_role: "Couldn't sign you in with that Discord account.",
};

/**
 * What someone signs in as (src/lib/access.ts), or a refusal. `existing` is their access if
 * they've signed in before; the first time, it's null and the member role decides.
 */
async function signInAs(discordId: string | null | undefined, existing: Access | null) {
  // The member role and casual sign-in are set on Group settings
  await loadSettings({ fresh: true });
  const member = discordId ? await getServerMember(discordId) : null;
  const decision = signInAccess({
    inServer: Boolean(member && !member.bot),
    hasRole: member?.hasRole ?? null,
    existing,
    casualSignIn: CASUAL_SIGN_IN,
    casualNight: CASUAL_NIGHT,
  });
  if (!decision.ok) {
    // With a code, Better Auth redirects the OAuth callback to /sign-in?error=<code>; without one it answers with raw JSON
    throw new APIError("FORBIDDEN", { code: decision.refusal, message: REFUSAL_MESSAGE[decision.refusal] });
  }
  return decision.access;
}

/**
 * Accounts whose first sign-in was just checked, so the session made right after it doesn't ask
 * Discord again. Both hooks run in the same request; a check more than a minute old doesn't count.
 */
const justChecked = new Map<string, number>();
function checkedJustNow(userId: string) {
  const at = justChecked.get(userId);
  justChecked.delete(userId);
  return at !== undefined && Date.now() - at < 60_000;
}

/**
 * Give a new member a player record: claim the one from imported play logs
 * that was @-mentioned with their Discord account (or, failing that, is the only
 * one with their name), or start a fresh one. Two players with their name could
 * be either, so they start fresh and merge their history in. Either way they get
 * a meeple color if they don't have one (pickColor).
 */
async function linkPlayer(userId: string, name: string, discordId: string | null) {
  const players = await db.select().from(schema.player);
  if (players.some((p) => p.userId === userId)) return;
  const color = pickColor(players.map((p) => p.color));
  const byName = matchByName(
    players.filter((p) => !p.userId && !p.discordId),
    name,
  );
  const match =
    (discordId && players.find((p) => !p.userId && p.discordId === discordId)) ||
    (byName && "player" in byName ? byName.player : null);

  if (match) {
    await db
      .update(schema.player)
      .set({ userId, discordId: discordId ?? match.discordId, color: match.color ?? color })
      .where(eq(schema.player.id, match.id));
    // The group may already have renamed their player ("Sam" for a handle like "sambo99"): keep that, not the Discord name
    if (match.name !== name) await db.update(schema.user).set({ name: match.name }).where(eq(schema.user.id, userId));
  } else {
    await db.insert(schema.player).values({ name, userId, discordId, color });
  }
}

/** Anyone who first signed in once the first six colors were taken went without one: they get one on their next sign-in */
async function colorIfNone(userId: string) {
  const mine = await db.query.player.findFirst({ where: eq(schema.player.userId, userId), columns: { id: true, color: true } });
  if (!mine || mine.color) return;
  const used = await db.select({ color: schema.player.color }).from(schema.player);
  await db.update(schema.player).set({ color: pickColor(used.map((p) => p.color)) }).where(eq(schema.player.id, mine.id));
}

export const auth = betterAuth({
  baseURL: SITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  // Without a Discord application (local development, a demo) there's no way to sign in but the shortcut in dev-login.ts
  socialProviders: process.env.DISCORD_CLIENT_ID
    ? {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET!,
          mapProfileToUser: (profile) => ({ email: discordAccountEmail(profile) }),
        },
      }
    : {},
  user: {
    additionalFields: {
      discordId: { type: "string", required: false, input: false },
      bggUsername: { type: "string", required: false, input: false },
      isAdmin: { type: "boolean", required: false, input: false },
      access: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days — it's a hobby site, stay signed in
  },
  // The Discord user id comes from the account row (Better Auth sets accountId from
  // Discord's own profile). Profile fields mapped onto the user are dropped when the
  // field is `input: false`, and making it `input: true` would let people edit it.
  databaseHooks: {
    account: {
      create: {
        // The first sign-in: the member role decides whether they're a member or a casual account
        before: async (account) => {
          if (account.providerId !== "discord") return;
          const access = await signInAs(account.accountId, null);
          await db.update(schema.user).set({ access }).where(eq(schema.user.id, account.userId));
          justChecked.set(account.userId, Date.now());
        },
        // Only after the membership check passed: record the id and give them a player
        after: async (account) => {
          if (account.providerId !== "discord") return;
          const [u] = await db
            .update(schema.user)
            .set({ discordId: account.accountId })
            .where(eq(schema.user.id, account.userId))
            .returning({ name: schema.user.name });
          if (u) await linkPlayer(account.userId, u.name, account.accountId);
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in: someone who leaves the server, or an admin removed, can't get back in.
        // After the first time Boardroom says what they are, not the role
        before: async (session) => {
          if (checkedJustNow(session.userId)) return;
          const [row, u] = await Promise.all([
            db.query.account.findFirst({
              where: and(eq(schema.account.userId, session.userId), eq(schema.account.providerId, "discord")),
              columns: { accountId: true },
            }),
            db.query.user.findFirst({ where: eq(schema.user.id, session.userId), columns: { access: true } }),
          ]);
          await signInAs(row?.accountId, u?.access ?? null);
        },
        after: async (session) => {
          await colorIfNone(session.userId);
        },
      },
    },
  },
  // OAuth failures that happen before the hooks (expired state, a stale tab) land on sign-in too, not Better Auth's own error page
  onAPIError: { errorURL: "/sign-in" },
  plugins: [nextCookies()],
});
