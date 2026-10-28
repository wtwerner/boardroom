import { handleInteraction } from "@/lib/discord-handlers";
import { type Interaction, PING, isFromDiscord, pong } from "@/lib/interactions";
import { loadSettings } from "@/lib/settings-store";

/** Posting a night and finishing the reply run after the response; this is how long they get */
export const maxDuration = 60;

/**
 * Discord sends every button click, slash command and form here: the Interactions Endpoint URL
 * in the application's settings. Each request is signed with the application's key, and
 * anything unsigned is refused (Discord checks that when the URL is saved).
 */
export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return new Response("Set DISCORD_PUBLIC_KEY to turn on Discord interactions", { status: 404 });

  const body = await request.text();
  const signed = await isFromDiscord(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), publicKey);
  if (!signed) return new Response("Bad request signature", { status: 401 });

  const interaction = JSON.parse(body) as Interaction;
  if (interaction.type === PING) return Response.json(pong());
  await loadSettings({ fresh: true });
  return Response.json(await handleInteraction(interaction));
}
