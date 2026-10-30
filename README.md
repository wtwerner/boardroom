# Boardroom

A private site for a board game group that plays together regularly. It keeps the group's play history, what everyone thinks of each game, and a shared shelf built from everyone's BoardGameGeek collections. It also plans each game night: who's coming, what to play, and what to read or watch beforehand. Events and plays go to and from the group's Discord, and if you turn it on, Claude can suggest what to play or buy next. Each group runs its own copy, on free tiers of Vercel and Turso.

**[Try the demo](https://try-boardroom.vercel.app)**, with a made-up group you can sign in as. Play around: it all resets every night.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/home-dark.jpg">
  <img alt="Home: the events coming up, the last one, plays and who shows up on each kind of night, the most played games, the group's favorites and what people want to play" src="docs/assets/screenshots/home.jpg">
</picture>

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle + SQLite (Turso) · Better Auth (Discord sign-in) · Claude API

## What it does

- **Getting set up.** Your first sign-in lands on one page with every step on it: check the name the group sees, find yourself in past plays, rate and rank the games you've played, and add your BGG collection and Board Game Arena name. Until you're set up, Home shows how far along you are.
- **Play log, kept in step with Discord.** Tap each game on the event's page as it's played, so everyone at the table sees the night's log fill in, or log it on the Plays page. The night's games go up as one post in the group's channel, linked to the event's thread, with a copy in the thread. The morning after, whoever made the event gets a DM if nothing's been logged yet. Plays people write in Discord by hand are imported too, back to the channel's first message.
- **Ratings and rankings.** Rate games with a tap, and rank the ones you've played with quick "this or that?" questions. Heavy and light games are ranked separately, so a party game never has to beat a long strategy game. The group's favorites come from everyone's lists.
- **Events in Discord.** Make an event on the site or with `/event new`, and it's posted to the events channel with its own thread. People answer Going, Maybe or Can't make it with the post's buttons or on the site, and can answer for someone else, even someone who isn't in Discord yet. Changing the event in either place updates the post and tells the thread. A few hours before it starts, a reply on the post pings whoever's going or a maybe.
- **Finding a date.** Offer a few dates on Plan or with `/event poll`, and everyone taps the ones that work for them. Pick one and the poll's post turns into the event's post, keeping its thread, with everyone that date worked for down as going. A reply on the post tells them, and asks everyone else to say if they're coming. A poll called off by mistake comes back with **Reopen**, votes and all. If a night's date falls through, **Find a new date** on its page puts it back to a poll without that date: answers are cleared, and the games proposed for it (or being brought, on a casual night) come back once a new date's picked. The button's on its post in Discord too. With a casual night on, a poll can be for either kind of night.
- **Planning a night.** Start from who's coming and get the shelf scored for that table: what they love, what they want to play, what hasn't been played in a while, and what suits the player count. Propose games, vote, lock one in, and the rules and teach videos are linked for prep.
- **Discover.** Games nobody owns, scored against everyone's taste with a calibrated "chance you'd like it", plus, with Claude on, its picks for the group or just for you.
- **A casual night too, if you have one.** A second, lighter night with guests, with its own channels and recommendations. Instead of voting on a game, people say what they're bringing, or ask whoever owns a game to bring it, and the bot DMs them to answer. When a casual regular wants in on the core group's nights, any member can invite them from People or from Discord's right-click menu.
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
| **Discord** | A server for the group, and a Discord application you create, for sign-in and a bot | Free |
| **[Vercel](https://vercel.com)** | Hosting and the nightly sync. The Hobby plan is enough | Free |
| **[Turso](https://turso.tech)** | The database | Free tier |
| **BoardGameGeek API token** | Optional: syncs collections automatically. Approval takes a week or more, so [ask for one](#1-ask-boardgamegeek-for-an-api-token) first. Until then, collections can be uploaded as a CSV export | Free, non-commercial use |
| **Anthropic API key** | Optional, for Claude's picks and reading hand-written play posts that don't follow the template | Pay as you go |

## Set it up

### 1. Ask BoardGameGeek for an API token

Register an application at <https://boardgamegeek.com/applications> (non-commercial). Once it's approved, create a token there: that's `BGG_API_TOKEN`. Carry on with the rest while you wait; you can add the token later.

### 2. Create the Discord application

Follow [docs/discord-setup.md](docs/discord-setup.md). You create the application yourself; the server owner only clicks an invite link to add the bot ([docs/server-owner.md](docs/server-owner.md) is written for them).

### 3. Create the database

```sh
turso db create boardroom
turso db show boardroom --url          # → DATABASE_URL
turso db tokens create boardroom       # → DATABASE_AUTH_TOKEN
```

The tables are created on the first deploy: every production build applies any new migrations before it builds.

### 4. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwtwerner%2Fboardroom&project-name=boardroom&repository-name=boardroom&env=BETTER_AUTH_SECRET,CRON_SECRET,DATABASE_URL,DATABASE_AUTH_TOKEN,DISCORD_CLIENT_ID,DISCORD_CLIENT_SECRET,DISCORD_BOT_TOKEN,DISCORD_GUILD_ID&envDescription=Secrets%2C%20the%20database%20and%20the%20group%27s%20Discord%20server&envLink=https%3A%2F%2Fgithub.com%2Fwtwerner%2Fboardroom%23environment-variables)

The button copies this repo into your GitHub account and asks for the variables below. Or fork the repo and import it at <https://vercel.com/new>, which makes pulling in updates a click (see [Updating](#updating)).

#### Environment variables

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET`, `CRON_SECRET` | Random secrets: `openssl rand -base64 32` for each |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | From step 3 |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` | From step 2 |
| `DISCORD_GUILD_ID` | The group's server |
| `BGG_API_TOKEN` | Optional: from step 1 |
| `ANTHROPIC_API_KEY` | Optional: lets an admin turn Claude on in Group settings. Create it in a workspace of its own with a monthly spend limit, and mark it Sensitive in Vercel |
| `DISCORD_PUBLIC_KEY` | Optional: turns on the buttons on nights' posts and the `/event` command (see [Nights in Discord](docs/discord-setup.md#part-4-nights-in-discord-optional)) |
| `DISCORD_COMMAND_NAME` | Optional: the slash command's name instead of `event` (`/event new`, `poll`, `edit`, `cancel`). Run `pnpm discord:commands` again after changing it |
| `BETTER_AUTH_URL` | The site's address. On Vercel it defaults to the project's production domain, so set it only for a custom domain or another host |
| `DEMO` | Optional: `on` makes the site a public demo on a made-up group (see [The demo](docs/how-it-works.md#the-demo)). Its nightly cron wipes the database, so give it one of its own. Ignored with `DISCORD_BOT_TOKEN` or `DISCORD_GUILD_ID` set |

[`.env.example`](.env.example) lists them all with notes. Once it's deployed, add `https://<your-domain>/api/auth/callback/discord` to the Discord application's OAuth2 redirects.

### 5. Sign in and set up the group

Sign in with Discord and open **Settings → Group settings**. Until someone's an admin, every member can change these, so start by making yourself one at the bottom of the page. Then choose:

| Setting | Default | |
| --- | --- | --- |
| Site name | Boardroom | Page titles, the header, and the button on posts in Discord |
| Time zone | UTC | Play dates and night times use it |
| What your events are called | Game night | What the group's own nights are called everywhere on the site |
| New events' title | `{date} ` and the night's name | What a new night is called unless someone names it. `{date}` is its date ("10/29"), `{game}` the game locked in for it or TBD: `{date} Game Night — {game}` makes "10/29 Game Night — TBD", then "10/29 Game Night — Root" once Root is locked in. Its thread has the same name |
| Reminder | 3 | How many hours before a night starts its post gets a reply pinging whoever's going or a maybe. `0` turns it off. Needs [the tick](#reminders-and-the-morning-after) |
| A casual night too | off | A second, casual night with its own name, title and channels (see [Core and casual nights](docs/how-it-works.md#core-and-casual-nights)) |
| Heavy from BGG weight | 2.75 | Where the two rankings, Heavy games and Light games, split. Set it to the weight your group's heavier games start at |
| Use Claude | off | Claude's picks and reading hand-written play posts the parser can't. Shown once `ANTHROPIC_API_KEY` is set. Off, the site never calls Claude or mentions it |
| Picks a day | 5 | Claude's picks each person can ask for in a day |
| Member role | none | Only people with this Discord role can sign in (see [Who can sign in](docs/how-it-works.md#who-can-sign-in)) |
| Plays channel | none | Where plays logged on the site are posted, and where hand-written ones are read from. One for each kind of night |
| Events channel | none | Where each kind of night is posted, with its thread: a text channel or a forum. Needs `DISCORD_PUBLIC_KEY` |
| Announcements channel | none | A chat channel each kind of night is announced in, with its details and a link to its post, for events channels people don't read as they chat (a forum, say). The announcement takes the night's ping |
| Ping when an event is posted | nobody | Who a night's post (or its announcement, when there is one) pings when it first goes up: @here, @everyone or a role |
| Welcome channel | the usual place | Where someone invited to the core group's nights is greeted, instead of its announcements, events or plays channel (see [Inviting people](docs/discord-setup.md#part-5-inviting-people-to-the-core-groups-nights-optional)) |

The Discord settings pick from the server's channels and roles, so they only show once the bot is in the server. Admins can make other members admins on the same page. A change shows across the site straight away, with no redeploy.

### 6. Import the history

Tap **Sync from Discord** on the Plays page to import the channel's history. For a long history, run the same sync from your machine instead, where there's no serverless time limit. It picks up where it left off:

```sh
pnpm install
pnpm sync .env.production     # a file with the production variables (gitignored)
```

After that, a nightly cron (`vercel.json`, 09:00 UTC) syncs Discord, BGG collections and Board Game Arena.

### Reminders and the morning after

With nights posted in Discord ([Part 4](docs/discord-setup.md#part-4-nights-in-discord-optional)), Boardroom replies to a night's post a few hours before it starts, pinging whoever's going or a maybe and reminding anyone bringing games to bring them. The morning after, it DMs whoever made the night if nothing's been logged for it. The same tick closes polls whose dates have all gone by. Vercel's Hobby crons only run once a day, so something else has to call `/api/cron/tick` every few minutes through the day. A free scheduler like [cron-job.org](https://cron-job.org) does it on time: make a job that sends a GET to `https://<your-domain>/api/cron/tick` every 5 minutes, with the header `Authorization: Bearer <CRON_SECRET>` (the same value as in Vercel), and use its test run to check it gets a 200.

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

With Node 24 (what CI runs) and pnpm:

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
