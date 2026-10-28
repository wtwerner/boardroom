import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { SITE_URL } from "@/config";
import { db, schema } from "@/db";
import { MEEPLE_COLORS } from "@/db/enums";
import { groupMemberRefusal } from "./discord";
import { discordAccountEmail } from "./discord-email";
import { matchByName } from "./players";
import type { SignInRefusal } from "./sign-in-refusal";

const REFUSAL_MESSAGE: Record<SignInRefusal, string> = {
  not_in_server: "This site is only for members of the game group's Discord server.",
  missing_role: "Couldn't sign you in with that Discord account.",
};

async function assertGroupMember(discordId: string | null | undefined) {
  const refusal = discordId ? await groupMemberRefusal(discordId) : "not_in_server";
  if (refusal) {
    // With a code, Better Auth redirects the OAuth callback to /sign-in?error=<code>; without one it answers with raw JSON
    throw new APIError("FORBIDDEN", { code: refusal, message: REFUSAL_MESSAGE[refusal] });
  }
}

/**
 * Give a new member a player record: claim the one from imported play logs
 * that was @-mentioned with their Discord account (or, failing that, is the only
 * one with their name), or start a fresh one. Two players with their name could
 * be either, so they start fresh and merge their history in. Either way they get
 * the first free meeple color.
 */
async function linkPlayer(userId: string, name: string, discordId: string | null) {
  const players = await db.select().from(schema.player);
  if (players.some((p) => p.userId === userId)) return;
  const taken = new Set(players.map((p) => p.color).filter(Boolean));
  const color = MEEPLE_COLORS.find((c) => !taken.has(c)) ?? null;
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
        before: async (account) => {
          if (account.providerId === "discord") await assertGroupMember(account.accountId);
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
        // Re-checked on every sign-in so people who leave the server (or lose the role) lose access
        before: async (session) => {
          const row = await db.query.account.findFirst({
            where: and(eq(schema.account.userId, session.userId), eq(schema.account.providerId, "discord")),
            columns: { accountId: true },
          });
          await assertGroupMember(row?.accountId);
        },
      },
    },
  },
  // OAuth failures that happen before the hooks (expired state, a stale tab) land on sign-in too, not Better Auth's own error page
  onAPIError: { errorURL: "/sign-in" },
  plugins: [nextCookies()],
});
