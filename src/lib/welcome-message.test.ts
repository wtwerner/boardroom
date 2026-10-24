import { describe, expect, it } from "vitest";
import { componentText } from "./discord-message";
import { type Welcome, type WelcomeResult, welcomeDm, welcomePost, welcomeSummary } from "./welcome-message";

const casey: Welcome = {
  discordId: "100000000000000004",
  name: "Casey",
  by: { name: "Sam", discordId: "100000000000000001" },
  roleName: "Strategy",
  siteName: "Boardroom",
  setupUrl: "https://boardroom.example/welcome",
  eventsChannelId: "100000000000000009",
  command: "event",
  coreNight: "Strategy",
};

type Row = { type: number; components?: { url?: string }[] };
const button = (m: { components: unknown[] }) => (m.components as Row[]).find((c) => c.type === 1)?.components?.[0];

describe("welcomePost", () => {
  it("says hi by mention, and what the role adds", () => {
    expect(componentText(welcomePost(casey).components)).toBe(
      [
        "### 👋 Welcome in, <@100000000000000004>!",
        "<@100000000000000001> gave you the **Strategy** role, so **Strategy** events are open to you now too, plus a few more channels. Sign in to Boardroom to rank the games you've played and help pick what's next.",
      ].join("\n"),
    );
  });

  it("treats it as an extra, not joining a group: everyone's at the casual night already", () => {
    for (const m of [welcomePost(casey), welcomeDm(casey)]) expect(componentText(m.components)).not.toMatch(/the group|still yours/);
  });

  it("names an inviter who isn't in Discord, and copes with no role or no casual night", () => {
    expect(componentText(welcomePost({ ...casey, by: { name: "Sam" }, roleName: null }).components)).toContain("**Sam** added you. Sign in");
    expect(componentText(welcomePost({ ...casey, coreNight: null }).components)).toContain("gave you the **Strategy** role. Sign in");
  });

  it("links to the setup page when the site's address is known", () => {
    expect(button(welcomePost(casey))).toMatchObject({ url: "https://boardroom.example/welcome" });
    expect(button(welcomePost({ ...casey, setupUrl: null }))).toBeUndefined();
  });
});

describe("welcomeDm", () => {
  it("says what the role adds, with the link and the steps", () => {
    const text = componentText(welcomeDm(casey).components);
    expect(text).toContain("### Hey Casey!");
    expect(text).toContain("Sam gave you the **Strategy** role, so **Strategy** events are open to you now too, plus a few more channels. It also gets you into Boardroom: https://boardroom.example/welcome");
    expect(text).toContain("Plays you've been tagged in come with you, casual night ones too.");
    expect(text).toMatch(/1\. \*\*Sign in[\s\S]*4\. \*\*Add your BGG username\*\* if you have one/);
  });

  it("points at the events channel and the group's command", () => {
    expect(componentText(welcomeDm({ ...casey, command: "session" }).components)).toContain("Events go up in <#100000000000000009>. Hit **Going** on one, or make your own with `/session new`.");
    expect(componentText(welcomeDm({ ...casey, eventsChannelId: null, coreNight: null }).components)).not.toMatch(/<#|casual/);
  });

  it("keeps names from being read as markdown", () => {
    expect(componentText(welcomeDm({ ...casey, name: "c_a_s" }).components)).toContain("c\\_a\\_s");
  });
});

describe("welcomeSummary", () => {
  const done: WelcomeResult = { name: "Casey", role: "given", roleName: "Strategy", post: { channelId: "100000000000000009" }, dm: "sent", setupUrl: "https://boardroom.example/welcome" };

  it("says everything it did in one line", () => {
    expect(welcomeSummary(done, (id) => `<#${id}>`)).toBe("Done: gave Casey the Strategy role, said hi to them in <#100000000000000009> and DMed them the setup link.");
  });

  it("names them in whichever step comes first", () => {
    expect(welcomeSummary({ ...done, role: "none" }, () => "Discord")).toBe("Done: said hi to Casey in Discord and DMed them the setup link.");
  });

  it("says what didn't work, with the link to send by hand", () => {
    const text = welcomeSummary(
      { ...done, role: "none", post: { error: "the bot can't post in that channel." }, dm: { error: "they've got DMs from server members turned off." } },
      () => "Discord",
    );
    expect(text).toBe(
      [
        "Done: Casey can sign in now.",
        "Couldn't post the hello: the bot can't post in that channel.",
        "Couldn't DM them: they've got DMs from server members turned off. Send them https://boardroom.example/welcome yourself.",
      ].join("\n"),
    );
  });
});
