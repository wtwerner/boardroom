import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { maySignInAs } from "@/lib/dev-login";

/**
 * Local development, and a demo's made-up members: start a session for an existing user without
 * Discord. Writes the session row directly because the normal path re-checks Discord server
 * membership.
 */
export async function POST(request: Request) {
  const userId = String((await request.formData()).get("userId") ?? "");
  if (!maySignInAs(userId)) return new Response("Not found", { status: 404 });

  const user = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!user) return new Response("No such user — run `pnpm seed:dev`", { status: 400 });

  const ctx = await auth.$context;
  const cookie = ctx.authCookies.sessionToken;
  const token = randomBytes(24).toString("hex");
  const maxAge = cookie.attributes.maxAge ?? 60 * 60 * 24 * 7;
  await db.insert(schema.session).values({
    id: randomBytes(12).toString("hex"),
    token,
    userId,
    expiresAt: new Date(Date.now() + maxAge * 1000),
  });

  // Same signed format Better Auth uses: <token>.<base64 HMAC-SHA256>, URL-encoded. Over HTTPS
  // its cookie name starts __Secure-, which browsers only keep with Secure set.
  const signature = createHmac("sha256", ctx.secret).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${cookie.name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookie.attributes.secure ? "; Secure" : ""}`,
    },
  });
}
