import "server-only";
import { type AllowedMentions, type MessageBody, deleteMessage, editMessage, postMessage } from "./discord";

/**
 * A night's or poll's announcement in the group's chat channel (announce-message.ts), kept in
 * step with its post by night-post.ts and poll-post.ts. Where it's stored is theirs: `save`
 * swaps the stored ids from the message id `was` to `next`, false when another request got
 * there first.
 */

export type Announcement = { channelId: string | null; messageId: string | null };
type Save = (next: Announcement, was: string | null) => Promise<boolean>;

/** An announcement being posted right now; claimed for this long so two requests don't both post it */
const CLAIM_MS = 60_000;
const claimed = (messageId: string | null) => Boolean(messageId?.startsWith("pending:"));
const stale = (messageId: string) => Number(messageId.slice("pending:".length)) < Date.now() - CLAIM_MS;

/**
 * Edit the announcement where it is, or post it in `channelId` when there's none yet and
 * `post` says it may (one someone deleted is posted again). `first` is a new one's body, with
 * its ping. Never throws: the post itself is what matters.
 */
export async function syncAnnouncement(
  current: Announcement,
  channelId: string | null,
  body: MessageBody,
  opts: { post: boolean; first?: { body: MessageBody; allowedMentions?: AllowedMentions } },
  save: Save,
) {
  try {
    let was = current.messageId;
    if (was && !claimed(was)) {
      if (await editMessage(current.channelId!, was, body)) return;
      // Someone deleted it
      if (!(await save({ channelId: null, messageId: null }, was))) return;
      was = null;
    }
    if (!opts.post || !channelId || (was && !stale(was))) return;
    const claim = `pending:${Date.now()}`;
    if (!(await save({ channelId, messageId: claim }, was))) return;
    try {
      const msg = await postMessage(channelId, opts.first?.body ?? body, opts.first?.allowedMentions);
      if (!(await save({ channelId, messageId: msg.id }, claim))) await deleteMessage(channelId, msg.id);
    } catch (err) {
      await save({ channelId: null, messageId: null }, claim);
      throw err;
    }
  } catch (err) {
    console.error(`Couldn't update the announcement in channel ${channelId ?? current.channelId}`, err);
  }
}

/** Take an announcement down, for a night that's deleted or moved to the other kind's channels */
export async function removeAnnouncement(current: Announcement) {
  if (!current.channelId || !current.messageId || claimed(current.messageId)) return;
  await deleteMessage(current.channelId, current.messageId).catch((err) => console.error("Couldn't delete the announcement", err));
}
