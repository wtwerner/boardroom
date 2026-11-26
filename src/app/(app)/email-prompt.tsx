import { and, eq, gt, isNull } from "drizzle-orm";
import { DISCORD_BOT } from "@/config";
import { db, schema } from "@/db";
import { postsNights } from "@/lib/discord";
import { emailReady } from "@/lib/email";
import { isPlaceholderEmail } from "@/lib/join";
import type { CurrentUser } from "@/lib/session";
import { EmailPromptButtons } from "./email-prompt-buttons";

/**
 * On Home, for someone the site would email about events if they'd confirmed their address:
 * anyone who joined before the site sent email, or whose Discord address it hasn't been told is
 * theirs. Gone once they confirm it or say no thanks.
 */
export async function EmailPrompt({ me }: { me: CurrentUser }) {
  if (!emailReady()) return null;
  const [u] = await db
    .select({ email: schema.user.email, verified: schema.user.emailVerified, updates: schema.user.emailUpdates, discordId: schema.user.discordId })
    .from(schema.user)
    .where(eq(schema.user.id, me.id));
  if (!u || u.verified || !u.updates || isPlaceholderEmail(u.email)) return null;
  // Discord tells them about their events, so email is for later, on Settings
  if (u.discordId && DISCORD_BOT && postsNights(me.access === "member" ? "core" : "casual")) return null;
  const link = await db.query.accessLink.findFirst({
    where: and(eq(schema.accessLink.kind, "email"), eq(schema.accessLink.userId, me.id), isNull(schema.accessLink.closedAt), eq(schema.accessLink.uses, 0), gt(schema.accessLink.expiresAt, new Date())),
    columns: { id: true },
  });
  return (
    <section aria-labelledby="email-prompt" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-card px-4 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <h2 id="email-prompt" className="text-sm font-semibold">
          {link ? "Check your email" : "Get emails about events?"}
        </h2>
        <p className="text-sm text-slate">
          {link
            ? `A link to confirm ${u.email} is on its way. Open it, and new events, date polls and reminders come to you there.`
            : `New events, date polls and reminders, to ${u.email}. Confirm it's yours first.`}
        </p>
      </div>
      <EmailPromptButtons sent={Boolean(link)} />
    </section>
  );
}
