import { buildCalendar } from "@/lib/calendar";
import { calendarEvent, calendarHost, calendarResponse, nightFromKey } from "@/lib/calendar-store";
import { loadSettings } from "@/lib/settings-store";

/** One night as a calendar file, from Add to calendar. The signed key in its address stands in for signing in. */
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/night/[file]">) {
  const { file } = await ctx.params;
  await loadSettings({ fresh: true });
  const night = await nightFromKey(file.replace(/\.ics$/, ""));
  if (!night || night.findingDate) return new Response("Not found", { status: 404 });
  return calendarResponse(buildCalendar([calendarEvent(night)], { host: calendarHost() }), 'attachment; filename="event.ics"');
}
