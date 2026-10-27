import { describe, expect, it } from "vitest";
import { botCommands, kindOfChannel, nightCommands, welcomeCommandName } from "./discord-commands";

describe("nightCommands", () => {
  it("has new, poll, edit and cancel under the group's command name", () => {
    const [command] = nightCommands("event");
    expect(command.name).toBe("event");
    expect(command.options.map((o) => o.name)).toEqual(["new", "poll", "edit", "cancel"]);
    expect(nightCommands("session")[0].name).toBe("session");
  });

  it("makes a night or a poll with a form, not options typed after the command", () => {
    const [newNight, poll] = nightCommands("event")[0].options;
    expect(newNight).not.toHaveProperty("options");
    expect(poll).not.toHaveProperty("options");
  });

  it("picks the night to edit or cancel from a list as people type", () => {
    const [, , edit, cancel] = nightCommands("event")[0].options;
    expect(edit.options?.[0]).toMatchObject({ name: "event", required: true, autocomplete: true });
    expect(cancel.options?.[0]).toMatchObject({ name: "event", required: true, autocomplete: true });
  });

  it("keeps within Discord's limits", () => {
    const walk = (o: { name: string; description: string; options?: unknown[] }): void => {
      expect(o.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(o.description.length).toBeLessThanOrEqual(100);
      (o.options as typeof o[] | undefined)?.forEach(walk);
    };
    nightCommands("event").forEach(walk);
  });
});

describe("botCommands", () => {
  it("adds Invite to … to the right-click menu, in the server only, for people who can manage roles", () => {
    const invite = botCommands("event", "Invite to Strategy events").at(-1);
    expect(invite).toEqual({ name: "Invite to Strategy events", type: 2, contexts: [0], default_member_permissions: "268435456" });
  });
});

describe("welcomeCommandName", () => {
  it("is named for the core group's night, or the site when there's only one kind", () => {
    expect(welcomeCommandName("Strategy", "Boardroom")).toBe("Invite to Strategy events");
    expect(welcomeCommandName("Game night", "Boardroom")).toBe("Invite to Game night events");
    expect(welcomeCommandName(null, "Boardroom")).toBe("Invite to Boardroom");
  });

  it("keeps to Discord's 32 characters", () => {
    expect(welcomeCommandName("Thursday heavy strategy game night", "Boardroom").length).toBeLessThanOrEqual(32);
  });
});

describe("kindOfChannel", () => {
  const channels = { core: ["10000000000000001", "10000000000000002"], casual: ["10000000000000003", null] };

  it("knows each kind's events and plays channels", () => {
    expect(kindOfChannel("10000000000000001", channels)).toBe("core");
    expect(kindOfChannel("10000000000000003", channels)).toBe("casual");
  });

  it("is null anywhere else, or without a channel", () => {
    expect(kindOfChannel("10000000000000009", channels)).toBeNull();
    expect(kindOfChannel(undefined, channels)).toBeNull();
  });
});
