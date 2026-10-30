import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { nightPingSetting, postMessage, replyToMessage } from "./discord";
import { isClaim, joinThread, postChannel, postInThread, renameNightThread, syncNightPost } from "./night-post";
import type { CardPerson } from "./night-message";
import { nightPing } from "./night-message";
import { everyoneAnsweredMessage, nudgeMessage, pickedMessage, refindMessage } from "./poll-message";
import { everyoneJustAnswered } from "./poll-store";
import { rankDates } from "./date-answers";

/**
 * What's said in Discord about a night finding its date: when someone answers (and so everyone
 * has), when it's nudged, when it gets its date, and when that date falls through. The post
 * itself follows the night throughout (syncNightPost): it's the same post the whole time.
 */

/**
 * Once someone's answered: the post shows it, they're added to the thread if they can come
 * (`join`), and once the last member has answered, the thread says which date's best and pings
 * whoever started it to set it
 */
export function answeredLater(nightId: number, pollId: number, join?: number) {
  after(async () => {
    try {
      const result = await syncNightPost(nightId);
      if (result === "posted") await joinThread(nightId);
      else if (result && join) await joinThread(nightId, [join]);
      const done = await everyoneJustAnswered(pollId);
      if (!done) return;
      const best = rankDates(done.poll.dates).find((d) => d.verdict === "everyone" || d.verdict === "best");
      const { body, allowedMentions } = everyoneAnsweredMessage({
        starter: done.starter,
        best: best ? { startsAt: best.startsAt, coming: best.yes.length + best.maybe.length, everyone: best.verdict === "everyone" } : null,
        min: done.poll.min,
      });
      await postInThread(nightId, body, allowedMentions);
    } catch (err) {
      console.error(`Couldn't update night ${nightId}'s post in Discord`, err);
    }
  });
}

/** Ping the members who haven't answered in the thread */
export function nudgeLater(nightId: number, waiting: CardPerson[], by: string) {
  after(async () => {
    try {
      const { body, allowedMentions } = nudgeMessage(waiting, by);
      await postInThread(nightId, body, allowedMentions);
    } catch (err) {
      console.error(`Couldn't nudge night ${nightId}'s thread`, err);
    }
  });
}

/**
 * Once its date's set: the post becomes the night's card, its thread is renamed with the date,
 * and a reply pings the group and the people coming, saying they're down from what they
 * answered. A night that was never posted is posted the usual way.
 */
export function announceDateSetLater(nightId: number, coming: { going: CardPerson[]; maybe: CardPerson[] }, by: { playerId: number }) {
  after(async () => {
    try {
      const result = await syncNightPost(nightId);
      if (!result) return;
      if (result === "edited") {
        const night = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId) });
        if (!night?.messageId) return;
        await renameNightThread(nightId);
        const { body, allowedMentions } = pickedMessage({ title: night.title, startsAt: night.startsAt.toISOString(), ...coming }, nightPing(nightPingSetting(night.night)));
        // On the announcement when there is one, where the night's ping goes; it links to the post
        const announced = night.announceChannelId && night.announceMessageId && !isClaim(night.announceMessageId);
        if (announced) await replyToMessage(night.announceChannelId!, night.announceMessageId!, body, allowedMentions);
        else await replyToMessage(await postChannel(night), night.messageId, body, allowedMentions);
      }
      await joinThread(nightId, undefined, [by.playerId]);
    } catch (err) {
      console.error(`Couldn't say night ${nightId}'s date is set in Discord`, err);
    }
  });
}

/**
 * Once its date falls through: the post shows the dates on offer again, its thread is renamed,
 * and a note there says which date and pings whoever was going
 */
export function announceFellThroughLater(nightId: number, note: Parameters<typeof refindMessage>[0]) {
  after(async () => {
    try {
      const result = await syncNightPost(nightId);
      const night = await db.query.gameNight.findFirst({ where: eq(schema.gameNight.id, nightId), columns: { threadId: true, messageId: true } });
      if (!night?.threadId || isClaim(night.messageId)) return;
      if (result === "edited") await renameNightThread(nightId);
      const { body, allowedMentions } = refindMessage(note);
      await postMessage(night.threadId, body, allowedMentions);
    } catch (err) {
      console.error(`Couldn't say night ${nightId}'s date fell through in Discord`, err);
    }
  });
}
