import { readFileSync } from "node:fs";

/**
 * Registers the bot's slash command (/event, or DISCORD_COMMAND_NAME) and its Invite to … user
 * command in the group's server, and uploads the symbols its posts use (assets/discord-emoji)
 * as the bot's own emoji. Run it once when setting up, and again after the commands or symbols
 * change or DISCORD_COMMAND_NAME does:
 *
 *   pnpm discord:commands                  # uses .env.local
 *   pnpm discord:commands .env.discord
 */
async function main() {
  process.loadEnvFile(process.argv[2] ?? ".env.local");
  const { botCommands } = await import("@/lib/discord-commands");
  const { commandName } = await import("@/lib/discord");
  const { welcomeName } = await import("@/lib/welcome");
  const { ICON_NAMES } = await import("@/lib/icons");

  const { DISCORD_CLIENT_ID: appId, DISCORD_GUILD_ID: guildId, DISCORD_BOT_TOKEN: token } = process.env;
  if (!appId || !guildId || !token) throw new Error("Set DISCORD_CLIENT_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN");

  // Guild commands show up at once, where global ones can take an hour
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(botCommands(commandName(), welcomeName())),
  });
  if (!res.ok) throw new Error(`Discord refused the commands: ${res.status} ${await res.text()}`);
  const saved = (await res.json()) as { name: string }[];
  console.log(`Registered ${saved.map((c) => `/${c.name}`).join(", ")} in the server.`);

  // The app's own emoji work in any server it's in. One already uploaded is left as it is:
  // delete it in the Developer Portal (the app's Emojis page) to upload a changed one.
  const emojiUrl = `https://discord.com/api/v10/applications/${appId}/emojis`;
  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const listed = await fetch(emojiUrl, { headers });
  if (!listed.ok) throw new Error(`Discord didn't list the bot's emoji: ${listed.status} ${await listed.text()}`);
  const have = new Set(((await listed.json()) as { items: { name: string }[] }).items.map((e) => e.name));
  const added: string[] = [];
  for (const name of ICON_NAMES.filter((n) => !have.has(n))) {
    const image = `data:image/png;base64,${readFileSync(`assets/discord-emoji/${name}.png`).toString("base64")}`;
    const up = await fetch(emojiUrl, { method: "POST", headers, body: JSON.stringify({ name, image }) });
    if (!up.ok) throw new Error(`Discord refused the ${name} emoji: ${up.status} ${await up.text()}`);
    added.push(name);
  }
  console.log(added.length ? `Uploaded the bot's ${added.join(", ")} emoji.` : "The bot's emoji were all uploaded already.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

export {};
