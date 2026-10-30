import { describe, expect, it } from "vitest";
import { type Interaction, actionId, commandOptions, formValues, isFromDiscord, memberName, modal, parseActionId, pickedUser } from "./interactions";

const hex = (b: ArrayBuffer) => Buffer.from(b).toString("hex");

async function signer() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const sign = async (timestamp: string, body: string) => hex(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(timestamp + body)));
  return { publicKey, sign };
}

describe("isFromDiscord", () => {
  it("accepts a request signed with the application's key", async () => {
    const { publicKey, sign } = await signer();
    const body = '{"type":1}';
    expect(await isFromDiscord(body, await sign("1700000000", body), "1700000000", publicKey)).toBe(true);
  });

  it("refuses a changed body, timestamp or key, and missing headers", async () => {
    const { publicKey, sign } = await signer();
    const other = await signer();
    const body = '{"type":1}';
    const sig = await sign("1700000000", body);
    expect(await isFromDiscord('{"type":2}', sig, "1700000000", publicKey)).toBe(false);
    expect(await isFromDiscord(body, sig, "1700000001", publicKey)).toBe(false);
    expect(await isFromDiscord(body, sig, "1700000000", other.publicKey)).toBe(false);
    expect(await isFromDiscord(body, null, "1700000000", publicKey)).toBe(false);
    expect(await isFromDiscord(body, "not hex", "1700000000", publicKey)).toBe(false);
    expect(await isFromDiscord(body, sig, "1700000000", "")).toBe(false);
  });
});

describe("action ids", () => {
  it("round-trips every action", () => {
    for (const a of [
      { kind: "rsvp", nightId: 12, status: "going" },
      { kind: "rsvp", nightId: 12, status: "maybe" },
      { kind: "rsvp", nightId: 12, status: "declined" },
      { kind: "edit", nightId: 7 },
      { kind: "cancel", nightId: 7 },
      { kind: "refind", nightId: 7 },
      { kind: "for", nightId: 7 },
      { kind: "new" },
      { kind: "new", seats: 6 },
      { kind: "welcome", userId: "100000000000000001" },
      { kind: "bring", planId: 41, yes: true },
      { kind: "bring", planId: 41, yes: false },
      { kind: "newPoll" },
      { kind: "pollVote", optionId: 88 },
      { kind: "pollAdd", pollId: 3 },
      { kind: "pollPick", pollId: 3 },
      { kind: "pollNone", pollId: 3 },
      { kind: "pollOff", pollId: 3 },
      { kind: "pollOff", pollId: 3, sure: true },
      { kind: "pollReopen", pollId: 3 },
    ] as const) {
      expect(parseActionId(actionId(a))).toEqual(a);
    }
  });

  it("stays well under Discord's 100 characters", () => {
    expect(actionId({ kind: "rsvp", nightId: 2 ** 31, status: "declined" }).length).toBeLessThan(30);
    expect(actionId({ kind: "welcome", userId: "10000000000000000001" }).length).toBeLessThan(40);
  });

  it("ignores ids it doesn't know", () => {
    expect(parseActionId(undefined)).toBeNull();
    expect(parseActionId("rsvp:12:y")).toBeNull();
    expect(parseActionId("v2:rsvp:12:y")).toBeNull();
    expect(parseActionId("v1:rsvp:12:x")).toBeNull();
    expect(parseActionId("v1:rsvp:abc:y")).toBeNull();
    expect(parseActionId("v1:vote:12")).toBeNull();
    expect(parseActionId("v1:welcome:12")).toBeNull();
    expect(parseActionId("v1:welcome:")).toBeNull();
    expect(parseActionId("v1:bring:41")).toBeNull();
    expect(parseActionId("v1:bring:0:y")).toBeNull();
    expect(parseActionId("v1:pv:0")).toBeNull();
    expect(parseActionId("v1:ppick:abc")).toBeNull();
  });
});

describe("formValues", () => {
  it("reads text inputs and selects inside labels", () => {
    const submitted = [
      { type: 18, id: 1, component: { type: 3, custom_id: "kind", values: ["casual"] } },
      { type: 18, id: 2, component: { type: 4, custom_id: "title", value: "  Thursday heavy " } },
      { type: 18, id: 3, component: { type: 4, custom_id: "location", value: "" } },
    ];
    expect(formValues(submitted)).toEqual({ kind: "casual", title: "Thursday heavy", location: "" });
  });

  it("reads the older action-row layout too", () => {
    expect(formValues([{ type: 1, components: [{ type: 4, custom_id: "date", value: "thu" }] }])).toEqual({ date: "thu" });
  });
});

describe("commandOptions", () => {
  it("reads a subcommand's options and which one is being typed", () => {
    const parsed = commandOptions([
      {
        name: "new",
        type: 1,
        options: [
          { name: "date", type: 3, value: " thu " },
          { name: "kind", type: 3, value: "core", focused: true },
        ],
      },
    ]);
    expect(parsed).toEqual({ sub: "new", values: { date: "thu", kind: "core" }, focused: "kind" });
  });

  it("copes with no options", () => {
    expect(commandOptions(undefined)).toEqual({ sub: null, values: {}, focused: null });
  });
});

describe("memberName", () => {
  const base = { type: 3, id: "1", application_id: "2", token: "t" };

  it("prefers the server nickname, then the display name, then the username", () => {
    const user = { id: "10000000000000001", username: "sam_b", global_name: "Sam B" };
    expect(memberName({ ...base, member: { user, nick: "Sammy", roles: [] } })).toBe("Sammy");
    expect(memberName({ ...base, member: { user, roles: [] } })).toBe("Sam B");
    expect(memberName({ ...base, member: { user: { ...user, global_name: null }, roles: [] } })).toBe("sam_b");
  });
});

describe("modal", () => {
  it("wraps each field in a label, with selects and prefilled text", () => {
    const m = modal("v1:new", "New night", [
      { id: "kind", label: "Kind of night", options: [{ label: "Game night", value: "core" }, { label: "Casual night", value: "casual" }], selected: "casual" },
      { id: "title", label: "Title", value: "Thursday heavy", required: true },
    ]);
    expect(m.type).toBe(9);
    expect(m.data.components[0]).toMatchObject({ type: 18, label: "Kind of night", component: { type: 3, custom_id: "kind" } });
    expect((m.data.components[0].component as { options: { default: boolean }[] }).options.map((o) => o.default)).toEqual([false, true]);
    expect(m.data.components[1]).toMatchObject({ type: 18, component: { type: 4, custom_id: "title", value: "Thursday heavy", required: true } });
  });

  it("makes a long text field several lines tall", () => {
    const m = modal("v1:newpoll", "Find a date", [{ id: "dates", label: "Dates", long: true, maxLength: 300 }]);
    expect(m.data.components[0].component).toMatchObject({ type: 4, style: 2, max_length: 300 });
  });

  it("makes a member picker optional", () => {
    const m = modal("v1:for:12", "Answer for someone else", [{ id: "who", label: "Who", user: true, placeholder: "Someone in the server" }]);
    expect(m.data.components[0]).toEqual({ type: 18, label: "Who", component: { type: 5, custom_id: "who", required: false, placeholder: "Someone in the server" } });
  });
});

describe("pickedUser", () => {
  const form = (select: object, resolved?: object): Interaction => ({
    type: 5,
    id: "1",
    application_id: "1",
    token: "t",
    data: { custom_id: "v1:for:12", components: [{ type: 18, component: { type: 5, custom_id: "who", ...select } }], ...(resolved ? { resolved } : {}) },
  });
  const users = { "10000000000000003": { id: "10000000000000003", username: "casey_", global_name: "Casey" } };

  it("reads who was picked, by the name the server shows", () => {
    expect(pickedUser(form({ values: ["10000000000000003"] }, { users, members: { "10000000000000003": { nick: "Case" } } }), "who")).toEqual({
      id: "10000000000000003",
      name: "Case",
      bot: false,
    });
    expect(pickedUser(form({ values: ["10000000000000003"], resolved: { users } }), "who")?.name).toBe("Casey");
  });

  it("says when nobody was picked, or a bot was", () => {
    expect(pickedUser(form({ values: [] }), "who")).toBeNull();
    expect(pickedUser(form({ values: ["10000000000000009"] }, { users: { "10000000000000009": { id: "10000000000000009", username: "eventbot", bot: true } } }), "who")?.bot).toBe(true);
  });
});
