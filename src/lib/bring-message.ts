/**
 * What the bot DMs someone asked to bring a game to a casual night, and what the DM says once
 * they've answered. Pure, so it's tested.
 */

import { actionId } from "./interactions";
import { ACTION_ROW, BUTTON, SECONDARY, SUCCESS, escape } from "./discord-components";

export type BringAsk = {
  planId: number;
  game: string;
  night: { title: string; startsAt: string };
  /** Who asked */
  by: string;
  /** The night's page, when the site's address is known */
  url: string | null;
};

/** "Sam asked if you'd bring Azul to Casual night, Thursday at 7", with a button for each answer */
export function bringAskDm(a: BringAsk) {
  const unix = Math.floor(Date.parse(a.night.startsAt) / 1000);
  const lines = [
    `**${escape(a.by)}** asked if you'd bring **${escape(a.game)}** to **${escape(a.night.title)}**, <t:${unix}:F>.`,
    a.url && `-# [The event](<${a.url}>)`,
  ];
  return {
    content: lines.filter(Boolean).join("\n"),
    components: [
      {
        type: ACTION_ROW,
        components: [
          { type: BUTTON, style: SUCCESS, label: "I'll bring it", custom_id: actionId({ kind: "bring", planId: a.planId, yes: true }) },
          { type: BUTTON, style: SECONDARY, label: "Can't this time", custom_id: actionId({ kind: "bring", planId: a.planId, yes: false }) },
        ],
      },
    ],
  };
}

/** What the DM becomes once answered, its buttons gone */
export function bringAnswered(a: { yes: boolean; game: string; night: string }) {
  return a.yes
    ? `You're bringing **${escape(a.game)}** to **${escape(a.night)}**. Thanks!`
    : `No problem. **${escape(a.game)}** is off the list for **${escape(a.night)}**.`;
}

export const bringAskGone = "That's not open anymore: someone else is bringing it, or it came off the list.";
