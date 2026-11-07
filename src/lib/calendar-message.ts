/**
 * What Add to calendar on a night's post answers with, seen only by whoever pressed it. A link
 * button on the post couldn't say who pressed it, and this way everyone in the server gets their
 * own sync link, account or not. Pure so it can be tested.
 */

import { type Action, actionId } from "./interactions";
import { ACTION_ROW, BUTTON, COMPONENTS_V2, type Component, LINK_BUTTON_STYLE, SECONDARY, TEXT, escape } from "./discord-components";

const linkButton = (label: string, url: string): Component => ({ type: BUTTON, style: LINK_BUTTON_STYLE, label, url });
const actionButton = (label: string, action: Action): Component => ({ type: BUTTON, style: SECONDARY, label, custom_id: actionId(action) });

export function buildCalendarPanel(p: { nightId: number; title: string; addUrl: string; syncUrl: string | null; newLink?: boolean }) {
  const text = [
    `**${escape(p.title)}**`,
    "**Add this event** puts it in your calendar as it is now. It won't follow any changes.",
    p.syncUrl
      ? "**Sync my events** subscribes your calendar to every event you say Going or Maybe to, and follows moves and cancellations. The link is yours: keep it to yourself."
      : "-# To sync every event you're coming to, say Going or Maybe, then press Add to calendar again.",
    ...(p.newLink ? ["-# That's your new link. The old one has stopped working, so subscribe again with this one."] : []),
  ].join("\n");
  return {
    flags: COMPONENTS_V2,
    components: [
      { type: TEXT, content: text },
      {
        type: ACTION_ROW,
        components: [
          linkButton("Add this event", p.addUrl),
          ...(p.syncUrl ? [linkButton("Sync my events", p.syncUrl), actionButton("New sync link", { kind: "calendarNew", nightId: p.nightId })] : []),
        ],
      },
    ],
  };
}

/** New sync link stops the old one working, so it asks first */
export function buildNewLinkCheck(nightId: number) {
  return {
    flags: COMPONENTS_V2,
    components: [
      { type: TEXT, content: "Your current sync link will stop working, and any calendar subscribed with it stops updating. Only do this if the link got out. Otherwise, dismiss this message." },
      { type: ACTION_ROW, components: [actionButton("Make a new link", { kind: "calendarNew", nightId, sure: true })] },
    ],
  };
}
