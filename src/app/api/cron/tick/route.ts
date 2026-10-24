import { sendLogNudges, sendReminders } from "@/lib/nudge-post";

/**
 * Every 15 minutes or so, from outside Vercel (Hobby's crons run once a day): the reminder
 * before a night starts, and the morning-after DM asking for its plays. See the README's
 * "Reminders" section for the GitHub Actions workflow that calls it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, unknown> = {};
  try {
    results.reminded = await sendReminders();
  } catch (err) {
    results.reminded = { error: String(err) };
  }
  try {
    results.askedToLog = await sendLogNudges();
  } catch (err) {
    results.askedToLog = { error: String(err) };
  }
  return Response.json(results);
}
