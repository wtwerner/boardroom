/**
 * Discord interactions: the button clicks, slash commands and forms Discord POSTs to
 * /api/discord/interactions. The bot stays HTTP-only, with nothing running between requests.
 * Pure (signature checks, ids, response shapes), so it's tested without Discord.
 */

import type { RsvpStatus } from "@/db/enums";
import { COMPONENTS_V2 } from "./discord-components";

// Interaction types Discord sends
export const PING = 1;
export const APPLICATION_COMMAND = 2;
export const MESSAGE_COMPONENT = 3;
export const AUTOCOMPLETE = 4;
export const MODAL_SUBMIT = 5;

// Response types
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const DEFERRED_UPDATE_MESSAGE = 6;
const UPDATE_MESSAGE = 7;
const AUTOCOMPLETE_RESULT = 8;
const MODAL = 9;

/** Only the person who used the command or button sees the reply */
const EPHEMERAL = 1 << 6;

// Components in forms
const TEXT_INPUT = 4;
const STRING_SELECT = 3;
const USER_SELECT = 5;
const LABEL = 18;
const SHORT = 1;
const PARAGRAPH = 2;

export type InteractionUser = { id: string; username: string; global_name?: string | null };

/** Users and members picked in a select, by id, as Discord sends them along */
export type Resolved = {
  users?: Record<string, InteractionUser & { bot?: boolean }>;
  members?: Record<string, { nick?: string | null }>;
};

export type CommandOption = { name: string; type: number; value?: string | number | boolean; focused?: boolean; options?: CommandOption[] };

export type Interaction = {
  type: number;
  id: string;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user: InteractionUser; nick?: string | null; roles: string[] };
  user?: InteractionUser;
  data?: {
    name?: string;
    /** For a command on someone's right-click menu, whoever was right-clicked */
    target_id?: string;
    custom_id?: string;
    /** What was chosen in a select menu */
    values?: string[];
    options?: CommandOption[];
    components?: unknown[];
    resolved?: Resolved;
  };
};

/**
 * Whether Discord sent this request: an Ed25519 signature over the timestamp and the raw body,
 * checked against the application's public key. Discord also sends bad signatures on purpose
 * when the endpoint URL is saved, and expects them refused.
 */
export async function isFromDiscord(body: string, signature: string | null, timestamp: string | null, publicKeyHex: string) {
  if (!signature || !timestamp || !/^[0-9a-f]+$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

function hexBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * What a button or form is for, carried in its custom_id (100 characters at most).
 * The version prefix lets a later change of scheme ignore old buttons rather than misread them.
 */
export type Action =
  | { kind: "rsvp"; nightId: number; status: RsvpStatus }
  | { kind: "edit"; nightId: number }
  /** Answer for someone else: the card's button, and the form it opens */
  | { kind: "for"; nightId: number }
  /** /event new's form, with the seats given after the command */
  | { kind: "new"; seats?: number }
  | { kind: "cancel"; nightId: number }
  /** Find a new date on a night's post, and the form it opens */
  | { kind: "refind"; nightId: number }
  /** Invite someone to the core group's nights: the confirm button after Invite to … */
  | { kind: "welcome"; userId: string }
  /** Answer being asked to bring a game to a casual night: the buttons on the DM */
  | { kind: "bring"; planId: number; yes: boolean }
  /** A poll to find a date: the form /event poll opens */
  | { kind: "newPoll" }
  /** Works for me, on one of a poll's dates */
  | { kind: "pollVote"; optionId: number }
  /** Suggest a date and Set the date on a poll's post, and the forms they open */
  | { kind: "pollAdd"; pollId: number }
  | { kind: "pollPick"; pollId: number }
  /** None work: can't, on every date on offer; `here` from the My answers panel, which it updates */
  | { kind: "pollNone"; pollId: number; here?: boolean }
  /** My answers on a poll's post, which opens a panel only they see */
  | { kind: "pollMine"; pollId: number }
  /** One date's answer on that panel, chosen from its menu */
  | { kind: "pollAns"; optionId: number }
  /** Call it off on a poll's post, and `sure` on the button that confirms it */
  | { kind: "pollOff"; pollId: number; sure?: boolean }
  /** Reopen, on the post of a poll that was called off */
  | { kind: "pollReopen"; pollId: number };

const RSVP_CODES: Record<string, RsvpStatus> = { y: "going", m: "maybe", n: "declined" };

/** A poll's actions in custom_ids, kept short */
const POLL_CODES = { pollVote: "pv", pollAdd: "padd", pollPick: "ppick", pollNone: "pnone", pollMine: "pmine", pollAns: "pans", pollOff: "poff", pollReopen: "preo" } as const;

export function actionId(a: Action): string {
  switch (a.kind) {
    case "rsvp":
      return `v1:rsvp:${a.nightId}:${Object.entries(RSVP_CODES).find(([, s]) => s === a.status)?.[0] ?? "y"}`;
    case "new":
      return a.seats ? `v1:new:${a.seats}` : "v1:new";
    case "welcome":
      return `v1:welcome:${a.userId}`;
    case "bring":
      return `v1:bring:${a.planId}:${a.yes ? "y" : "n"}`;
    case "newPoll":
      return "v1:newpoll";
    case "pollVote":
    case "pollAns":
      return `v1:${POLL_CODES[a.kind]}:${a.optionId}`;
    case "pollNone":
      return `v1:${POLL_CODES.pollNone}:${a.pollId}${a.here ? ":p" : ""}`;
    case "pollAdd":
    case "pollPick":
    case "pollMine":
    case "pollReopen":
      return `v1:${POLL_CODES[a.kind]}:${a.pollId}`;
    case "pollOff":
      return `v1:${POLL_CODES.pollOff}:${a.pollId}${a.sure ? ":y" : ""}`;
    default:
      return `v1:${a.kind}:${a.nightId}`;
  }
}

export function parseActionId(id: string | undefined): Action | null {
  const [v, kind, rawNight, code] = (id ?? "").split(":");
  if (v !== "v1") return null;
  if (kind === "new") {
    const seats = Number(rawNight);
    return Number.isInteger(seats) && seats > 0 && seats <= 100 ? { kind, seats } : { kind };
  }
  if (kind === "newpoll") return { kind: "newPoll" };
  const poll = (Object.entries(POLL_CODES) as [keyof typeof POLL_CODES, string][]).find(([, code]) => code === kind)?.[0];
  if (poll) {
    const id = Number(rawNight);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (poll === "pollVote" || poll === "pollAns") return { kind: poll, optionId: id };
    if (poll === "pollNone") return code === "p" ? { kind: poll, pollId: id, here: true } : { kind: poll, pollId: id };
    if (poll === "pollOff") return code === "y" ? { kind: poll, pollId: id, sure: true } : { kind: poll, pollId: id };
    return { kind: poll, pollId: id };
  }
  // Discord ids are too big for a Number, so they stay strings
  if (kind === "welcome") return /^\d{15,20}$/.test(rawNight ?? "") ? { kind, userId: rawNight } : null;
  if (kind === "bring") {
    const planId = Number(rawNight);
    return Number.isInteger(planId) && planId > 0 && (code === "y" || code === "n") ? { kind, planId, yes: code === "y" } : null;
  }
  const nightId = Number(rawNight);
  if (!Number.isInteger(nightId) || nightId <= 0) return null;
  if (kind === "rsvp") return RSVP_CODES[code] ? { kind, nightId, status: RSVP_CODES[code] } : null;
  if (kind === "edit" || kind === "cancel" || kind === "for" || kind === "refind") return { kind, nightId };
  return null;
}

/** The value of each field in a submitted form, by custom_id: a text input's text, or a select's choice */
export function formValues(components: unknown[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const node = c as { custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (node.custom_id && typeof node.value === "string") out[node.custom_id] = node.value.trim();
    if (node.custom_id && Array.isArray(node.values)) out[node.custom_id] = node.values[0] ?? "";
    walk(node.component);
    for (const child of node.components ?? []) walk(child);
  };
  for (const c of components ?? []) walk(c);
  return out;
}

/**
 * Who was picked in a form's member select, with the name the server shows for them. Discord
 * sends the picked users along with the form, on the interaction or on the select itself.
 */
export function pickedUser(i: Interaction, fieldId: string): { id: string; name: string; bot: boolean } | null {
  let resolved = i.data?.resolved;
  let id: string | undefined;
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const node = c as { custom_id?: string; values?: string[]; resolved?: Resolved; component?: unknown; components?: unknown[] };
    if (node.custom_id === fieldId && Array.isArray(node.values)) {
      id = node.values[0];
      resolved = node.resolved ?? resolved;
    }
    walk(node.component);
    for (const child of node.components ?? []) walk(child);
  };
  for (const c of i.data?.components ?? []) walk(c);
  if (!id) return null;
  const user = resolved?.users?.[id];
  return { id, name: resolved?.members?.[id]?.nick || user?.global_name || user?.username || "Someone", bot: Boolean(user?.bot) };
}

/** A slash command's options by name, from inside its subcommand */
export function commandOptions(options: CommandOption[] | undefined): { sub: string | null; values: Record<string, string>; focused: string | null } {
  const sub = options?.find((o) => o.type === 1);
  const values: Record<string, string> = {};
  let focused: string | null = null;
  for (const o of sub?.options ?? options ?? []) {
    if (o.value !== undefined) values[o.name] = String(o.value).trim();
    if (o.focused) focused = o.name;
  }
  return { sub: sub?.name ?? null, values, focused };
}

/** The name the server shows for whoever's clicking */
export function memberName(i: Interaction) {
  const u = i.member?.user ?? i.user;
  return i.member?.nick || u?.global_name || u?.username || "Someone";
}

// Responses

export const pong = () => ({ type: PONG });

export const reply = (content: string) => ({ type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

/** A question only they see, with buttons to answer it (a confirmation, say) */
export const ask = (content: string, buttons: { label: string; customId: string; danger?: boolean }[]) => ({
  type: CHANNEL_MESSAGE,
  data: {
    content,
    flags: EPHEMERAL,
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: buttons.map((b) => ({ type: 2, style: b.danger ? 4 : 2, label: b.label, custom_id: b.customId })) }],
  },
});

/** Replace the message the button was on (one only they see), taking its buttons away */
export const updateReply = (content: string) => ({ type: UPDATE_MESSAGE, data: { content, components: [], allowed_mentions: { parse: [] } } });

/** A message built from components (Components V2) that only they see, like the My answers panel */
export const panel = (body: { components: unknown[] }) => ({ type: CHANNEL_MESSAGE, data: { ...body, flags: EPHEMERAL | COMPONENTS_V2, allowed_mentions: { parse: [] } } });

/** That panel again, in place of the one they just used */
export const updatePanel = (body: { components: unknown[] }) => ({ type: UPDATE_MESSAGE, data: { ...body, flags: EPHEMERAL | COMPONENTS_V2, allowed_mentions: { parse: [] } } });

/** "Thinking…", seen only by them, while slower work finishes after the response */
export const deferReply = () => ({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });

/** Acknowledge a button without a reply; the post itself is edited after */
export const deferUpdate = () => ({ type: DEFERRED_UPDATE_MESSAGE });

export const choices = (list: { name: string; value: string }[]) => ({
  type: AUTOCOMPLETE_RESULT,
  data: { choices: list.slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.value })) },
});

export type FormField =
  | { id: string; label: string; value?: string; placeholder?: string; required?: boolean; maxLength?: number; description?: string; /** Several lines */ long?: boolean }
  | { id: string; label: string; options: { label: string; value: string }[]; selected?: string; description?: string }
  /** Pick someone in the server; optional */
  | { id: string; label: string; user: true; placeholder?: string; description?: string };

/** A form (Discord calls it a modal): up to five text fields, single-choice selects or member pickers */
export function modal(customId: string, title: string, fields: FormField[]) {
  return {
    type: MODAL,
    data: {
      custom_id: customId,
      title: title.slice(0, 45),
      components: fields.slice(0, 5).map((f) => ({
        type: LABEL,
        label: f.label.slice(0, 45),
        ...(f.description ? { description: f.description.slice(0, 100) } : {}),
        component:
          "user" in f
            ? { type: USER_SELECT, custom_id: f.id, required: false, ...(f.placeholder ? { placeholder: f.placeholder.slice(0, 150) } : {}) }
            : "options" in f
            ? {
                type: STRING_SELECT,
                custom_id: f.id,
                options: f.options.map((o) => ({ label: o.label.slice(0, 100), value: o.value, default: o.value === f.selected })),
              }
            : {
                type: TEXT_INPUT,
                custom_id: f.id,
                style: f.long ? PARAGRAPH : SHORT,
                required: f.required ?? false,
                max_length: f.maxLength ?? 100,
                ...(f.value ? { value: f.value.slice(0, f.maxLength ?? 100) } : {}),
                ...(f.placeholder ? { placeholder: f.placeholder.slice(0, 100) } : {}),
              },
      })),
    },
  };
}
