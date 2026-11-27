import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { CASUAL_NIGHT, CASUAL_SIGN_IN, DISCORD_SIGN_IN, PASSWORD_SIGN_IN, SITE_URL } from "@/config";
import { db, schema } from "@/db";
import type { Access } from "@/db/enums";
import { passwordAccess, signInAccess, startedByPassword } from "./access";
import { getServerMember } from "./discord";
import { discordAccountEmail } from "./discord-email";
import { pickColor } from "./meeple";
import { linkPlayer } from "./player-link";
import { PASSWORD_MAX, PASSWORD_MIN } from "./join";
import { loadSettings } from "./settings-store";
import type { SignInRefusal } from "./sign-in-refusal";

const REFUSAL_MESSAGE: Record<SignInRefusal, string> = {
  not_in_server: "This site is only for members of the game group's Discord server.",
  missing_role: "Couldn't sign you in.",
  passwords_off: "This site doesn't use passwords. Sign in with Discord.",
};

// With a code, Better Auth redirects the OAuth callback to /sign-in?error=<code>; without one it answers with raw JSON
const refuse = (code: SignInRefusal) => new APIError("FORBIDDEN", { code, message: REFUSAL_MESSAGE[code] });

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
  if (!decision.ok) throw refuse(decision.refusal);
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
  // Accounts are only made from an invite, or for a new site's first (account-store.ts), never by
  // signing up here. Whether the group uses passwords at all is checked as a session starts, below
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: PASSWORD_MAX },
  account: {
    // Two accounts with the same email are only joined by someone signed in to one of them (Connect
    // Discord on Settings), never because the addresses match: an invite's is whatever they typed
    accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true, trustedProviders: ["discord"] },
  },
  // Counted in the database: in memory, each server would give out its own tries
  rateLimit: { storage: "database" },
  socialProviders: DISCORD_SIGN_IN
    ? {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID!,
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
    user: {
      create: {
        // Discord says whether it checked the address, but that's not the same as someone choosing to get
        // emails at it: emails about events go to an address confirmed here (reach.ts)
        before: async (user) => ({ data: { ...user, emailVerified: false } }),
      },
    },
    account: {
      create: {
        // The first sign-in: the member role decides whether they're a member or a casual account.
        // Someone already signed in here who's connecting Discord stays what they are
        before: async (account) => {
          if (account.providerId !== "discord") return;
          const mine = await db.query.account.findFirst({ where: eq(schema.account.userId, account.userId), columns: { id: true } });
          if (mine) {
            const u = await db.query.user.findFirst({ where: eq(schema.user.id, account.userId), columns: { access: true } });
            await signInAs(account.accountId, u?.access ?? "removed");
            return;
          }
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
          if (!u) return;
          await linkPlayer(account.userId, u.name, account.accountId);
          // Connecting it later: their player is tagged by it too, unless old posts already gave it
          // to another name, which they can merge into theirs on Settings
          const taken = await db.query.player.findFirst({ where: and(eq(schema.player.discordId, account.accountId), ne(schema.player.userId, account.userId)), columns: { id: true } });
          const unclaimed = await db.query.player.findFirst({ where: and(eq(schema.player.discordId, account.accountId), isNull(schema.player.userId)), columns: { id: true } });
          if (!taken && !unclaimed) await db.update(schema.player).set({ discordId: account.accountId }).where(and(eq(schema.player.userId, account.userId), isNull(schema.player.discordId)));
        },
      },
      delete: {
        // Disconnected: their id is free for whichever account it's connected to next
        after: async (account) => {
          if (account.providerId !== "discord") return;
          await db.update(schema.user).set({ discordId: null }).where(and(eq(schema.user.id, account.userId), eq(schema.user.discordId, account.accountId)));
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in: someone who leaves the server, or an admin removed, can't get back in.
        // After the first time Boardroom says what they are, not the role
        before: async (session, ctx) => {
          if (checkedJustNow(session.userId)) return;
          // By password: an invite let them in, so it's the group's passwords and their access that count
          if (startedByPassword(ctx?.path)) {
            await loadSettings({ fresh: true });
            const u = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId), columns: { access: true } });
            const decision = passwordAccess({ enabled: PASSWORD_SIGN_IN, existing: u?.access ?? null, casualNight: CASUAL_NIGHT });
            if (!decision.ok) throw refuse(decision.refusal);
            return;
          }
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
