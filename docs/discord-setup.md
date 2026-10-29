# Discord setup

Boardroom uses one Discord application for two jobs:

- **Login** (OAuth2). Members sign in with their Discord account.
- **A bot user** that reads the plays channel, posts plays logged in the app, checks that people signing in are in the server, and (optionally) posts each game night with a thread and buttons to answer.

The bot isn't a program running anywhere. The site makes a few API calls with its token when it needs to, and Discord sends button clicks and slash commands to the site's address.

You create and own the application, and that needs no permissions on the server. The server owner, or anyone with **Manage Server**, only has to approve adding the bot.

## Part 1: create the application (you)

1. Go to <https://discord.com/developers/applications> and choose **New Application**. Name it "Boardroom", or whatever should show next to the bot in the member list. For the meeple the site uses, upload [`docs/assets/discord-app-icon.png`](assets/discord-app-icon.png) as the **App Icon** on **General Information** and as the **Icon** on the **Bot** tab.
2. **OAuth2** tab:
   - Copy the **Client ID** and use **Reset Secret** to get the **Client Secret**. Keep both in a password manager.
   - Under **Redirects**, add `http://localhost:3000/api/auth/callback/discord`. Add `https://<your-domain>/api/auth/callback/discord` once the site is deployed.
3. **Bot** tab:
   - **Reset Token** and keep it in your password manager. It's the bot's password.
   - Turn on **Message Content Intent**. Without it the bot sees empty messages and can't read play logs.
   - Turn on **Server Members Intent** (optional). It gives Settings a dropdown of server members for linking players to Discord accounts.
   - Leave **Public Bot** on for now so the owner's invite link works, and leave **Requires OAuth2 Code Grant** off. You can turn Public Bot off once the bot is in the server. Discord first requires **Installation → Install Link** to be set to **None**; the hand-built invite link below still works afterward.
4. Build the invite link and send it to the owner. It grants View Channel, Send Messages and Read Message History for plays, and Create Public Threads and Send Messages in Threads for nights' threads. The `bot` scope brings slash commands with it.

   ```
   https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=309237713920
   ```

## Part 2: add the bot to the server (server owner)

Send the owner [server-owner.md](server-owner.md): it has these steps written for them. Replace `<APP_URL>` and `<CLIENT_ID>` in your copy before sending it.

1. Open the invite link while logged in to Discord.
2. Pick the group's server from **Add to server** and choose **Continue**. Only servers where you have Manage Server are listed.
3. Leave the permissions ticked and choose **Authorize**.
4. If the plays channel is private or has its own permission settings: open the channel's **Edit Channel → Permissions**, add the bot's role (named after the app), and allow **View Channel**, **Read Message History** and **Send Messages**. Do the same for the casual night's channel if it's logged too, and for the events channels nights are posted in (with **Create Public Threads** and **Send Messages in Threads** as well).
5. If anyone outside the group is in this server (casual players, say), create a role for the group (e.g. "Core group") under **Server Settings → Roles** and give it to each member. The site will let only that role sign in.

The bot can't do anything beyond those permissions. It only acts in the channels the site is configured for, and it only pings people about nights: whoever's going before one starts, whoever the group picks when one's posted (Part 4), and someone a member invites (Part 5). To remove it, use **Server Settings → Integrations** or kick it.

## Part 3: connect it (you)

1. In Discord, turn on **User Settings → Advanced → Developer Mode**, then right-click the server icon and choose **Copy Server ID**.
2. Add the values to `.env.local`, and later to Vercel:

   ```sh
   DISCORD_CLIENT_ID=
   DISCORD_CLIENT_SECRET=
   DISCORD_BOT_TOKEN=
   DISCORD_GUILD_ID=
   ```

3. Restart `pnpm dev`, choose **Sign in with Discord**, and open **Settings → Group settings**. Make yourself an admin at the bottom, then pick the channels and role from the server's:
   - **Plays channel**: the **core group's**. To log the casual night too, turn on **A casual night too** and pick its channel as well.
   - **Member role**: the role from Part 2, step 5, if you made one. Without it, anyone in the server can sign in, and Settings says so.
4. Open **Plays → Sync from Discord**.

   The seeded test data lives in the same local database. To import real plays into a clean one, run `rm local.db && pnpm db:migrate` first.

## Part 4: nights in Discord (optional)

Boardroom can post each night to an events channel: a card with when and where, who's coming and the plan so far, buttons to answer Going, Maybe or Can't make it (the symbols the card heads each list with), to answer for **Someone else…** and to **Edit** it, and a thread for talking it over. In a text channel, the thread starts with a short copy of the post's buttons, since Discord won't let anyone press the buttons on the card shown at the top of a thread; the copy's buttons work, and it stays in step with the post. In a forum, each night is a forum post whose buttons work as they are, and it can be announced in a chat channel too. Members also get `/event new`, `/event poll`, `/event edit` and `/event cancel` (`DISCORD_COMMAND_NAME` picks another word than `event`). `/event poll` posts a few dates to the events channel for people to vote on (with a casual night, the form asks which kind of night it's for, starting on the one whose channel it was run in); picking one turns that post into the night's, and a poll that was called off can be reopened from its post. Everything goes through the same night on the site, so answering or changing it in either place updates the other.

1. Make a channel for each kind of night, or reuse ones the group already has (a text channel or a forum). Pick them as the **Events channel** on Group settings, one for each kind of night.
   - A **text channel** keeps each night's card in the chat, where people can answer without opening anything, with a thread hanging off it.
   - A **forum** gives each night a post of its own, named after it, with the talk underneath and nothing doubled up. People don't watch a forum the way they watch chat, so pick a chat channel as the **Announcements channel** to announce nights in: the announcement shows when and where, how many are coming and the game, links to the post, and is kept up to date. It takes the night's ping (step 5).
   - Moving a kind of night's events to a different channel later leaves the nights already posted where they are, threads and all; nights made from then on go to the new one. To move the coming ones too, run `pnpm move:posts --move` (without `--move` it lists what would move): each is posted in the new channel without a ping, and the old post and its thread get a note linking to it.
2. In the developer portal, **General Information** tab: copy the **Public Key** into `DISCORD_PUBLIC_KEY`. Deploy, so the site has it.
3. On the same tab, set **Interactions Endpoint URL** to `https://<your-domain>/api/discord/interactions` and save. Discord checks the address answers before it saves it.
4. Register the slash commands in the server, and upload the symbols the posts use as the bot's own emoji (until they're uploaded, posts use plain emoji). Run it again whenever a Boardroom update changes them:

   ```sh
   node scripts/with-env.mjs .env.production pnpm discord:commands
   ```

5. Optional: to ping people when a night (or a poll to find its date) is posted, pick @here, @everyone or a role under **Ping when an event is posted** on Group settings. Only the first post pings (or its announcement, when nights are announced); edits never do. `here`, `everyone` and a role that isn't **Allow anyone to @mention this role** need the bot's role to have **Mention @everyone, @here, and All Roles**, which the invite link leaves out; the owner can give it under **Server Settings → Roles**.
6. Optional: for the reminder before each night and the morning-after DM asking for its plays, set up [the tick](../README.md#reminders-and-the-morning-after).

## Part 5: inviting people to the core group's nights (optional)

Everyone in the server can come to the casual night. When one of them wants in on the core group's nights too, any member can invite them: from **People → Invite someone to …** on the site, or by right-clicking them in Discord and picking **Apps → Invite to …** (named for the core group's night, like *Invite to Game night events*, or for the site when there's no casual night). Boardroom then:

- gives them the member role from Group settings, so they can sign in and see the core group's channels (skipped when the group has no role);
- says hi in the core group's channel, pinging only them, with a **Get set up** button;
- DMs them the setup steps and a link to the site's setup page (`/welcome`);
- lists them on People as invited until they sign in, when their plays from the logs come with them.

To turn it on:

1. Giving the role needs the bot's role to have **Manage Roles** and to sit **above** the member role in **Server Settings → Roles** (Discord only lets a role hand out roles below it). The owner can authorize this invite link, which adds Manage Roles to what the bot already has, then drag the bot's role above the member role:

   ```
   https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=309506149376
   ```

2. Optional: pick the channel to say hi in as the **Welcome channel** on Group settings. Without it, the hello goes in the core group's events channel, or its plays channel if there's no events channel. It's never posted in one of the casual night's channels.
3. Register the commands again, so **Invite to …** shows up on the right-click menu (Part 4, step 4). After that, saving a new site or night name on Group settings renames it. The site's form works without this; the right-click command also needs `DISCORD_PUBLIC_KEY` and the Interactions Endpoint URL from Part 4.
4. At first only people with **Manage Roles** see it, so it isn't on everyone's menu. To let every member use it, the owner opens **Server Settings → Integrations → Boardroom → Invite to …** and adds the member role. Any member can invite people from the site's People page either way.

The messages keep it light: getting the role is an extra (the heavier nights and a few more channels), not joining a group, since everyone's already at the casual night.

Someone with DMs from server members turned off still gets the role and the hello; whoever invited them is told to send the link themselves.

### Testing it locally

An application has one Interactions Endpoint URL, so don't point your group's application at your machine. Make a second application for testing (Parts 1 to 3 again, in a server of your own), and point its endpoint at a tunnel to your dev server:

```sh
cloudflared tunnel --url http://localhost:3000   # prints an https://….trycloudflare.com address
```

Set the test application's endpoint to `https://<tunnel>/api/discord/interactions`, put its variables (including `DISCORD_PUBLIC_KEY`) in `.env.discord`, and run `pnpm dev:discord` and `node scripts/with-env.mjs .env.discord pnpm discord:commands`. The site ignores interactions from any server other than `DISCORD_GUILD_ID`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "That Discord account isn't in the group's server" on sign-in | The bot isn't in the server yet, or `DISCORD_GUILD_ID` is wrong |
| "Couldn't sign you in with that Discord account" | The account lacks the member role on Group settings |
| Group settings asks for channel ids instead of listing them | The bot isn't in the server yet, or can't see its channels (Part 2) |
| Sync says `403` / Missing Access | The bot's role can't see one of the plays channels (Part 2, step 4) |
| Sync runs but imports nothing | Message Content Intent is off (Part 1, step 3) |
| Discord shows "Invalid OAuth2 redirect_uri" | The callback URL isn't listed under OAuth2 → Redirects exactly |
| Discord won't save the Interactions Endpoint URL | The site isn't deployed with `DISCORD_PUBLIC_KEY` yet, or the key is from another application |
| `/event poll` (or `/event` itself) doesn't show up | `pnpm discord:commands` hasn't been run against this server, or the bot was added without the `bot` scope |
| Inviting someone says the bot can't hand out roles | The bot's role lacks **Manage Roles**, or sits below the group's role in Server Settings → Roles (Part 5) |
| **Invite to …** isn't on the right-click menu, or has an old name | `pnpm discord:commands` hasn't been run since updating or renaming the core group's night (Part 4, step 4). Only people with Manage Roles see it until the owner adds the member role (Part 5) |
| A night's post or thread doesn't appear | The bot's role can't post or make threads in the events channel (Part 2, step 4). The site logs the reason; the next change to the night tries again |
| Posts show plain emoji (✅ 📅) instead of Boardroom's symbols | `pnpm discord:commands` hasn't been run since updating. Posts pick the symbols up within ten minutes |
| Buttons say "This interaction failed" | The endpoint URL points somewhere else (another deploy, an old tunnel) |
