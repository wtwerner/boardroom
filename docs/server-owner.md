# Adding Boardroom to the server

Boardroom is the core group's site for play history, rankings and planning game nights (`<APP_URL>`). People sign in with Discord, and a bot reads and posts plays in the core group's channel and, if you like, the casual night's. It can also post each game night in an events channel, with a thread and buttons to say who's coming. Adding it takes a few minutes and needs the **Manage Server** permission, which the server owner has.

## 1. Add the bot

Open this link while logged in to Discord:

```
https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=309237713920
```

Choose the server under **Add to server**, leave the permissions ticked (View Channel, Send Messages, Read Message History, Create Public Threads, Send Messages in Threads) and choose **Authorize**. If the bot is already in the server, opening the link again and authorizing updates its permissions.

## 2. Let it into its channels

Skip this for a channel that's visible to everyone in the server.

If the core group's plays channel (or the casual night's) is private, open the channel's **Edit Channel → Permissions**, add the **Boardroom** role (Discord created it along with the bot) and allow **View Channel**, **Send Messages** and **Read Message History**. For the channels game nights are posted in, also allow **Create Public Threads** and **Send Messages in Threads**.

## 3. Give the group a role (if the server has other people in it)

Skip this if everyone in the server is in the group. Otherwise the site should only let in people with one particular role, so others in the server can't sign in. Use an existing role if the group already has one. Otherwise create one under **Server Settings → Roles** (for example "Core group") and give it to each member. The role needs no permissions of its own.

## 4. Let the bot hand out the group's role (optional)

Members can invite someone from the casual side to the core group's nights: the bot gives them the group's role, says hi and DMs them how to get set up on the site. Skip this if the group doesn't want that; members can still give the role by hand.

To allow it, open this link and authorize it, which adds **Manage Roles** to the bot's permissions:

```
https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=309506149376
```

Then, under **Server Settings → Roles**, drag the **Boardroom** role above the group's role. Discord only lets a role give out roles below it, so this also keeps the bot from touching any role above its own.

**Invite to …** on the right-click menu (named for the core group's night) is only shown to people with Manage Roles at first, so it isn't on everyone's menu. To let every member of the group invite people from Discord, open **Server Settings → Integrations → Boardroom → Invite to …** and add the group's role.

## 5. Tell whoever runs the site

Which channel the group logs plays in, which one the casual night uses if there is one, which channels game nights should be posted in, which role to use, if any, and where to welcome new members if not the events channel. That's all; they connect the rest.

## What the bot does

- Reads messages in the plays channels to import past and new plays.
- Posts a card in the right channel when someone logs a play on the site. It tags the players without pinging them.
- Checks that someone signing in to the site is in the server, and has the role if there is one.
- Posts each game night in its events channel with a thread, and updates the post as people answer with its buttons. Members can make, change and cancel nights with `/event`. Under **Server Settings → Integrations → Boardroom** you can limit who can use the command.
- A few hours before a night, replies to its post pinging whoever's going or a maybe.
- DMs someone when a member asks them to bring a game they own to the casual night, with buttons to answer.
- If you did step 4: gives the group's role to someone a member invites (from the site, or with **Apps → Invite to …** on their right-click menu), says hi to them in the group's channel and DMs them a link to get set up. It never takes a role away.
- If the group wants a ping when a night is posted (`@here`, or a role that isn't mentionable by everyone), give the **Boardroom** role **Mention @everyone, @here, and All Roles** under **Server Settings → Roles**. Otherwise leave it off.

The site only reads the channels it's set up for. The bot has just the permissions above: it can't manage the server or its members, and without step 4 it can't manage roles either. With it, it can only give the group's role, and only roles below its own.

To remove it, go to **Server Settings → Integrations → Boardroom** and choose **Remove App**, or kick the bot.
