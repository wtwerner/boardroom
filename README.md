# Boardroom

A private site for a board game group that plays together regularly. It keeps the group's play history, what everyone thinks of each game, and a shared shelf built from everyone's BoardGameGeek collections. It also plans each game night: who's coming, what to play, and what to read or watch beforehand. It runs on its own: you invite people with a link, and it emails them about events if you give it a mail server. If your group's on Discord, connect it and events and plays go to and from there too. Turn it on, and Claude can suggest what to play or buy next. Each group runs its own copy, on free tiers of Vercel and Turso.

**[Try the demo](https://try-boardroom.vercel.app)**, with a made-up group you can sign in as. Play around: it all resets every night.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/home-dark.jpg">
  <img alt="Home: the events coming up, the last one, plays and who shows up on each kind of night, the most played games, the group's favorites and what people want to play" src="docs/assets/screenshots/home.jpg">
</picture>

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle + SQLite (Turso) · Better Auth (invites and passwords, or Discord) · Claude API

## What it does

- **Getting set up.** Your first sign-in lands on one page with every step on it: check the name the group sees, find yourself in past plays, rate and rank the games you've played, and add your BGG collection and Board Game Arena name. Until you're set up, Home shows how far along you are.
- **Invites.** Make a link and send it however the group talks: one for the whole chat, or one for someone in past plays, who gets their history with it. No outside service needed.
- **Play log.** Tap each game on the event's page as it's played, so everyone at the table sees the night's log fill in, or log it on the Plays page. The morning after, whoever made the event is asked to log it if nobody has. With Discord, the night's games go up as one post in the group's channel, linked to the event's thread, with a copy in the thread, and plays people write there by hand are imported too, back to the channel's first message.
- **Ratings and rankings.** Rate games with a tap, and rank the ones you've played with quick "this or that?" questions. Heavy and light games are ranked separately, so a party game never has to beat a long strategy game. The group's favorites come from everyone's lists.
- **Events, with email.** Make an event and everyone hears about it, says if they're coming, and is reminded a few hours before. Moves, cancellations, dates to pick and seats that open up are emailed too, with the event attached for calendars. Each person can turn it off, from Settings or the link in any email.
- **Events in Discord, if you use it.** Make an event on the site or with `/event new`, and it's posted to the events channel with its own thread. People answer Going, Maybe or Can't make it with the post's buttons or on the site, and can answer for someone else, even someone who isn't in Discord yet. Changing the event in either place updates the post and tells the thread. A few hours before it starts, a reply on the post pings whoever's going or a maybe.
- **Finding a date.** Offer a few dates on Plan or with `/event poll`, and the event's made right away with its date TBD: its own page (and, in Discord, its post and thread), which it keeps once the date's set. Everyone says *Works*, *If I have to* or *Can't* for each date (in Discord, **Works for me** or the **My answers** panel), and dates they leave count as can't. It shows who's answered and which date's best, tells whoever started it once everyone has, and again on the day to decide by if they gave one. **Set the date** lists them best first, and everyone's down as they answered. If the date falls through, **Date fell through** puts the event back to picking one, with every answer and game kept. With a casual night on, it can be for either kind of night.
- **Planning a night.** Start from who's coming and get the shelf scored for that table: what they love, what they want to play, what hasn't been played in a while, and what suits the player count. Propose games, vote, lock one in, and the rules and teach videos are linked for prep.
- **Discover.** Games nobody owns, scored against everyone's taste with a calibrated "chance you'd like it", plus, with Claude on, its picks for the group or just for you.
- **A casual night too, if you have one.** A second, lighter night with guests, with its own recommendations (and channels). Instead of voting on a game, people say what they're bringing, or ask whoever owns a game to bring it, who gets an email or a DM to answer. Casual regulars can have accounts of their own for that night, and when one wants in on the core group's nights, an admin moves them up.
- **Online.** Which of your games are on Board Game Arena, and who's up for playing them there.

[docs/how-it-works.md](docs/how-it-works.md) covers all of it in detail, and the site's own *How it works* page explains every number to members.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/clips/ranking-dark.gif">
  <img alt="Ranking: answering 'Which would you rather play?' a few times, each game slotting into your list while the group's list re-sorts beside it" src="docs/assets/clips/ranking-light.gif">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/clips/plan-dark.gif">
  <img alt="Planning a night: adding someone to who's coming re-scores the recommendations, switching to light games puts a new one on top, and proposing it adds it to the night" src="docs/assets/clips/plan-light.gif">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/event-dark.png">
  <img alt="An event's page: who's coming, the game the group locked in with its prep links, and the other games proposed" src="docs/assets/screenshots/event.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/casual-event-dark.png">
  <img alt="A casual night's page: who's coming, and the games people are bringing, with one owner asked to bring theirs" src="docs/assets/screenshots/casual-event.png">
</picture>

## What you need

| | | |
| --- | --- | --- |
| **[Vercel](https://vercel.com)** | Hosting and the nightly sync. The Hobby plan is enough | Free |
| **[Turso](https://turso.tech)** | The database | Free tier |
| **A mail server** | Optional: any SMTP account, for reminders, news about events and forgotten passwords. Without one the site works, and people look at it for what's on | Often free |
| **Discord** | Optional: a server for the group, and a Discord application you create, for signing in and a bot | Free |
| **BoardGameGeek API token** | Optional: syncs collections automatically. Approval takes a week or more, so [ask for one](#1-ask-boardgamegeek-for-an-api-token) first. Until then, collections can be uploaded as a CSV export | Free, non-commercial use |
| **Anthropic API key** | Optional, for Claude's picks and reading hand-written play posts that don't follow the template | Pay as you go |

## Set it up

### 1. Ask BoardGameGeek for an API token

Register an application at <https://boardgamegeek.com/applications> (non-commercial). Once it's approved, create a token there: that's `BGG_API_TOKEN`. Carry on with the rest while you wait; you can add the token later.

### 2. Create the database

```sh
turso db create boardroom
turso db show boardroom --url          # → DATABASE_URL
turso db tokens create boardroom       # → DATABASE_AUTH_TOKEN
```

The tables are created on the first deploy: every production build applies any new migrations before it builds.

### 3. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwtwerner%2Fboardroom&project-name=boardroom&repository-name=boardroom&env=BETTER_AUTH_SECRET,CRON_SECRET,SETUP_CODE,DATABASE_URL,DATABASE_AUTH_TOKEN&envDescription=Secrets%20and%20the%20database&envLink=https%3A%2F%2Fgithub.com%2Fwtwerner%2Fboardroom%23environment-variables)

The button copies this repo into your GitHub account and asks for the variables below. Or fork the repo and import it at <https://vercel.com/new>, which makes pulling in updates a click (see [Updating](#updating)).

#### Environment variables

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET`, `CRON_SECRET` | Random secrets: `openssl rand -base64 32` for each |
| `SETUP_CODE` | A code you make up, 12 characters or more, and type once to make the first account, so nobody else who finds the site can. Not needed when people sign in with Discord |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | From step 2 |
| `SMTP_URL`, `EMAIL_FROM` | Optional: sends email. `smtps://user:password@host:465` (with any special characters in the password percent-encoded), and who it's from: `Boardroom <games@example.com>` |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | Optional: the Discord application and the group's server (see [Adding Discord](#adding-discord)) |
| `BGG_API_TOKEN` | Optional: from step 1 |
| `ANTHROPIC_API_KEY` | Optional: lets an admin turn Claude on in Group settings. Create it in a workspace of its own with a monthly spend limit, and mark it Sensitive in Vercel |
| `DISCORD_PUBLIC_KEY` | Optional: turns on the buttons on nights' posts and the `/event` command (see [Nights in Discord](docs/discord-setup.md#part-4-nights-in-discord-optional)) |
| `DISCORD_COMMAND_NAME` | Optional: the slash command's name instead of `event` (`/event new`, `poll`, `edit`, `cancel`). Run `pnpm discord:commands` again after changing it |
| `BETTER_AUTH_URL` | The site's address. On Vercel it defaults to the project's production domain, so set it only for a custom domain or another host |
| `DEMO` | Optional: `on` makes the site a public demo on a made-up group (see [The demo](docs/how-it-works.md#the-demo)). Its nightly cron wipes the database, so give it one of its own. Ignored with `SETUP_CODE`, `DISCORD_BOT_TOKEN` or `DISCORD_GUILD_ID` set, and its reset refuses a database with real accounts |

[`.env.example`](.env.example) lists them all with notes.

### 4. Set up the group

Open the site. It asks for your name, email, a password and the setup code, and makes you the admin. (With Discord sign-in, sign in with Discord instead and make yourself an admin at the bottom of **Group settings**: until someone is one, every member can change them.) Then choose, on **Settings → Group settings**:

| Setting | Default | |
| --- | --- | --- |
| Site name | Boardroom | Page titles, the header, emails, and the button on posts in Discord |
| Time zone | UTC | Play dates and night times use it |
| What your events are called | Game night | What the group's own nights are called everywhere on the site |
| New events' title | `{date} ` and the night's name | What a new night is called unless someone names it. `{date}` is its date ("10/29/26"), `{game}` the game locked in for it or TBD: `{date} Game Night — {game}` makes "10/29/26 Game Night — TBD", then "10/29/26 Game Night — Root" once Root is locked in. Its thread has the same name |
| Fewest to set a date | 2, or 3 for a casual night | Picking a date, how many need to be able to come for a date to be worth setting. A date with fewer shows as too few |
| Reminder | 3 | How many hours before a night starts whoever's going or a maybe is reminded, by email or with a reply on its post. `0` turns it off. Needs [the tick](#reminders-and-the-morning-after) |
| How long an event runs | 3 | Hours, for when an event ends in people's calendars. Events only have a start time otherwise |
| A casual night too | off | A second, casual night with its own name, title and channels (see [Core and casual nights](docs/how-it-works.md#core-and-casual-nights)) |
| Casual players can sign in | off | With a casual night and Discord sign-in: anyone in the Discord server without the member role signs in with an account for the casual night only. Admins move people up, down or out on **People and access** (see [Casual accounts](docs/how-it-works.md#casual-accounts)) |
| People can join without Discord | off | With Discord sign-in: admins can also invite people by link, who sign in with a password. Without Discord it's always on |
| People per group link | 30 | The most people a link for the group's chat lets in, including links already out |
| Days a group link works | 7 | How long a new link for the group's chat works. Admins can turn one off sooner |
| Heavy from BGG weight | 2.75 | Where the two rankings, Heavy games and Light games, split. Set it to the weight your group's heavier games start at |
| Show people's BGG ratings | off | Each person's own BGG rating beside their face on a game's page, and on the shelf when you point at a face. Off, BGG ratings still suggest faces, settle clear calls when ranking and count in the planner, out of sight |
| Use Claude | off | Claude's picks and reading hand-written play posts the parser can't. Shown once `ANTHROPIC_API_KEY` is set. Off, the site never calls Claude or mentions it |
| Picks a day | 5 | Claude's picks each person can ask for in a day |
| Member role | none | Who's a member the first time they sign in; after that admins decide on **People and access**, and the bot keeps the role in step (see [Who can sign in](docs/how-it-works.md#who-can-sign-in)) |
| Plays channel | none | Where plays logged on the site are posted, and where hand-written ones are read from. One for each kind of night |
| Events channel | none | Where each kind of night is posted, with its thread: a text channel or a forum. Needs `DISCORD_PUBLIC_KEY` |
| Announcements channel | none | A chat channel each kind of night is announced in, with its details and a link to its post, for events channels people don't read as they chat (a forum, say). The announcement takes the night's ping |
| Ping when an event is posted | nobody | Who a night's post (or its announcement, when there is one) pings when it first goes up: @here, @everyone or a role. A night still picking its date pings when its date's set instead |
| Welcome channel | the usual place | Where someone invited to the core group's nights is greeted, instead of its announcements, events or plays channel (see [Inviting people](docs/discord-setup.md#part-5-inviting-people-to-the-core-groups-nights-optional)) |

The Discord settings pick from the server's channels and roles, so they only show once the bot is in the server. Admins can make other members admins on the same page. A change shows across the site straight away, with no redeploy.

### 5. Invite the group

On **Settings → People and access**, make a link and send it wherever the group talks. A link for the group's chat lets in up to 30 people for a week (both are on Group settings); a link for one person works once, and can be for someone in past plays, who gets those plays. Links can be turned off, and members can be taken off the site. Anyone who joins as a member can edit and delete the group's plays and events, so keep the link to the group.

Someone who forgets their password gets a link by email, if the site sends it and they've confirmed their address. Otherwise an admin makes them one on the same page. If that's the only admin, run `node scripts/with-env.mjs .env.production pnpm password:link their@email`.

### Adding Discord

Do this from the start or any time later. Follow [docs/discord-setup.md](docs/discord-setup.md): you create the application yourself, and the server owner only clicks an invite link to add the bot ([docs/server-owner.md](docs/server-owner.md) is written for them). Add the four `DISCORD_` variables, redeploy, and add `https://<your-domain>/api/auth/callback/discord` to the application's OAuth2 redirects. A group that started without Discord keeps its passwords: people connect their Discord account on Settings, then sign in either way.

#### Import the history

Tap **Sync from Discord** on the Plays page to import the channel's history. For a long history, run the same sync from your machine instead, where there's no serverless time limit. It picks up where it left off:

```sh
pnpm install
pnpm sync .env.production     # a file with the production variables (gitignored)
```

After that, a nightly cron (`vercel.json`, 09:00 UTC) syncs Discord, BGG collections and Board Game Arena.

### Reminders and the morning after

A few hours before a night starts, Boardroom reminds whoever's going or a maybe, and anyone bringing games to bring them: by email, or with nights posted in Discord ([Part 4](docs/discord-setup.md#part-4-nights-in-discord-optional)), a reply on its post that pings them. The morning after, it emails or DMs whoever made the night if nothing's been logged for it. The same tick says so on the post of an event picking a date once every date on offer has gone by, and tells whoever started one on the day they said to decide by. Vercel's Hobby crons only run once a day, so something else has to call `/api/cron/tick` every few minutes through the day. A free scheduler like [cron-job.org](https://cron-job.org) does it on time: make a job that sends a GET to `https://<your-domain>/api/cron/tick` every 5 minutes, with the header `Authorization: Bearer <CRON_SECRET>` (the same value as in Vercel), and use its test run to check it gets a 200.

The repo also has a GitHub Actions workflow that calls the tick (`.github/workflows/tick.yml`). It's scheduled every 15 minutes once you add two repository secrets:

```sh
gh secret set SITE_URL      # https://<your-domain>
gh secret set CRON_SECRET   # the same value as in Vercel
```

GitHub runs scheduled workflows when it has room, though, often hours apart, so on its own it can miss a night's reminder. Keep it as a backup: a night is only reminded once, however many schedulers call the tick. It's free for a public repo or fork. On a private repo each run counts against GitHub's free Actions minutes, so run it hourly there (change `"2-59/15 * * * *"` to `"7 * * * *"`). GitHub turns off scheduled workflows in a repo with no activity for 60 days, and in a new fork until you open its **Actions** tab.

## Updating

Pull this repo's changes into your copy and Vercel redeploys it, applying any new migrations first. With a fork, that's GitHub's **Sync fork** button. With a copy from the Deploy button:

```sh
git remote add upstream https://github.com/wtwerner/boardroom.git   # once
git pull upstream main && git push
```

Posts already up in Discord take on a new look the next time their night changes. To update them all at once, run `node scripts/with-env.mjs .env.production pnpm refresh:posts`.

### Deploying from GitHub Actions instead

Vercel's GitHub app, which deploys a connected repo, also writes to it: a status on each commit, and it can set your site's address as the repo's website. To keep a public repo free of that, disconnect the project from the repo (in Vercel, **Settings → Git → Disconnect**) and let `.github/workflows/deploy.yml` deploy it once `ci` passes on `main`. Vercel still builds it, so the build log and settings stay there, and the workflow's log only says whether it worked.

```sh
vercel link                                                       # once, to make .vercel/project.json
gh secret set VERCEL_TOKEN        # a token from vercel.com/account/tokens, scoped to the project's team
gh secret set VERCEL_ORG_ID       # "orgId" in .vercel/project.json
gh secret set VERCEL_PROJECT_ID   # "projectId" in .vercel/project.json
```

Without the three secrets the workflow does nothing, so a project that stays connected deploys the usual way.

## Developing

With Node 24 (`.tool-versions` has the exact version CI runs) and pnpm:

```sh
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm seed:dev     # a fake group (Sam, Alex, Jordan, Casey) with about 40 plays
pnpm dev
```

Without Discord credentials, the sign-in page has **Sign in as…** buttons for the seeded members. Sam is the seeded group's admin, for Group settings. Turn on **A casual night too** there (or add `CASUAL_NIGHT=on` to `.env.local` before seeding) to see the casual night's side of the site, and run `pnpm seed:dev` again to give it plays and an event. Before opening a pull request, run `pnpm typecheck && pnpm test && pnpm lint`, the same checks CI runs. [CONTRIBUTING.md](CONTRIBUTING.md) has the rest: testing against a Discord server of your own, where code goes, and migrations.

## License

[MIT](LICENSE). The symbols on Discord posts (`assets/discord-emoji`) are [Font Awesome Free](https://fontawesome.com) icons, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The meeple is [Tabler Icons](https://tabler.io/icons)' `meeple-filled`, under [MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE). Game data comes from [BoardGameGeek](https://boardgamegeek.com) under its [API terms](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use), which allow non-commercial use only: run Boardroom for your group, not as a paid service.
