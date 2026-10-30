import { sendLogNudges, sendReminders } from "@/lib/nudge-post";
import { closeFinishedPolls, decideByDue } from "@/lib/poll-store";
import { sayDecideBy } from "@/lib/poll-post";
import { syncNightPost } from "@/lib/night-post";
import { loadSettings } from "@/lib/settings-store";

/**
 * Every 15 minutes or so, from outside Vercel (Hobby's crons run once a day): the reminder
 * before a night starts, the morning-after DM asking for its plays, and saying so on the post of
 * a night finding its date once every date on offer has gone by, and pinging whoever started one
 * on the day they said it should be decided by. See the README's "Reminders" section for the GitHub Actions workflow
 * that calls it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await loadSettings({ fresh: true });
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
  try {
    const closed = await closeFinishedPolls();
    for (const id of closed) await syncNightPost(id).catch((err) => console.error(`Couldn't say night ${id}'s dates have gone by in Discord`, err));
    results.pollsClosed = closed;
  } catch (err) {
    results.pollsClosed = { error: String(err) };
  }
  try {
    const due = await decideByDue();
    for (const poll of due) await sayDecideBy(poll).catch((err) => console.error(`Couldn't ping night ${poll.nightId}'s thread to decide`, err));
    results.decideBy = due.map((p) => p.nightId);
  } catch (err) {
    results.decideBy = { error: String(err) };
  }
  return Response.json(results);
}
