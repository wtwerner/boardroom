import { SITE_NAME } from "@/config";
import { buildCalendar } from "@/lib/calendar";
import { calendarHost, calendarResponse, feedEvents } from "@/lib/calendar-store";
import { loadSettings } from "@/lib/settings-store";

/** Someone's subscribed calendar. Calendar apps can't sign in, so the secret in its address stands in. */
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/feed/[file]">) {
  const { file } = await ctx.params;
  await loadSettings({ fresh: true });
  const events = await feedEvents(file.replace(/\.ics$/, ""));
  if (!events) return new Response("Not found", { status: 404 });
  return calendarResponse(buildCalendar(events, { host: calendarHost(), feedName: SITE_NAME }), 'inline; filename="events.ics"');
}
