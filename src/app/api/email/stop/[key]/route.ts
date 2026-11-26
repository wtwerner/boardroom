import { stopEmails } from "@/lib/email-stop-store";

/**
 * A mail app's own unsubscribe (List-Unsubscribe-Post, RFC 8058): it posts here, and emails about
 * events stop. The signed key in the address says whose. A visit is sent to the page, which asks
 * first, so a link checker opening it changes nothing.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/email/stop/[key]">) {
  const { key } = await ctx.params;
  return (await stopEmails(key)) ? new Response("Emails about events are off.") : new Response("Not found", { status: 404 });
}

export async function GET(request: Request, ctx: RouteContext<"/api/email/stop/[key]">) {
  const { key } = await ctx.params;
  return Response.redirect(new URL(`/email/stop/${encodeURIComponent(key)}`, request.url), 303);
}
