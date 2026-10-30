import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { nightPingSetting, postMessage, replyToMessage } from "./discord";
import { isClaim, joinThread, postChannel, renameNightThread, syncNightPost } from "./night-post";
import type { CardPerson } from "./night-message";
import { nightPing } from "./night-message";
import { pickedMessage, refindMessage } from "./poll-message";

/**
 * What's said in Discord when a night finding its date gets one, or its date falls through. The
 * post itself follows the night either way (syncNightPost): it's the same post throughout.
 */

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
