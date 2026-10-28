# Contributing

Thanks for helping. Boardroom is a small app run by groups for themselves, so changes should keep it simple to run and right for groups that aren't set up like the one it started with.

## Getting started

```sh
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm seed:dev     # a fake group (Sam, Alex, Jordan, Casey) with about 40 plays
pnpm dev
```

Without Discord credentials, the sign-in page has **Sign in as…** buttons for the seeded members. That shortcut only exists under `pnpm dev` with a local `file:` database; production builds strip it out, except on a demo (`DEMO=on`, see [The demo](docs/how-it-works.md#the-demo)), where it signs in as the seeded members and no one else. Add `CASUAL_NIGHT=on` to `.env.local` to see the casual night's side of the site, and run `pnpm seed:dev` again to give it plays and an event. Claude's picks need `CLAUDE=on` and an `ANTHROPIC_API_KEY`.

Read [docs/how-it-works.md](docs/how-it-works.md) before changing scoring, sync or votes. It's how the product works, where the data comes from, and where the code lives.

### Testing against a Discord server of your own

Make a Discord application of your own ([docs/discord-setup.md](docs/discord-setup.md)), add it to a server you own, and put its variables in `.env.discord` (gitignored). Point that file at a separate database, `DATABASE_URL=file:discord-test.db`, so the seeded group in `local.db` stays as it is.

```sh
DATABASE_URL=file:discord-test.db pnpm db:migrate   # once
pnpm dev:discord                                    # instead of pnpm dev
pnpm sync:discord                                   # the same sync as the nightly cron
```

`scripts/with-env.mjs` loads `.env.discord` for these. Variables already set win over the file, so a secret manager can fill them in instead (`op run --env-file=.env.discord -- pnpm dev:discord` with 1Password, say).

Nights' buttons and `/event` need Discord to reach your machine: give the test application its own Interactions Endpoint URL through a tunnel ([Testing it locally](docs/discord-setup.md#testing-it-locally)). The pure parts (`src/lib/interactions.ts`, `when.ts`, `night-message.ts`, `poll-message.ts`, `discord-commands.ts`) have tests that run without Discord.

## Before you open a pull request

- `pnpm typecheck && pnpm test && pnpm lint`. CI runs the same.
- Describe what changes for a group using the site, in plain words, and why. Commit subjects work the same way: what changed for the group, with the reason in the body. American spelling.

## Where code goes

- Mutations go in `src/app/actions.ts` and start with `requireUser()`.
- Pure logic goes in `src/lib` with a test next to it (`*.test.ts`, Vitest).
- Anything a group would set differently (names, the time zone, the weight the rankings split at, limits) comes from `src/config.ts`, never a literal. Name a night with `NIGHT_NAMES` and a ranking list with `TIER_LABEL`, never "core", "casual", "heavy" or "light" in text people read; `inSentence` from `src/lib/text.ts` lowercases a name mid-sentence. Add a new setting there, to `.env.example`, and to the settings table in the README.
- Casual-night UI and copy only show when `CASUAL_NIGHT` is on, so the site reads right for a group with one kind of night.
- The same goes for Claude and `CLAUDE`: off, the site never calls Claude or mentions it. Check `claudeReady()` from `src/lib/ai.ts` before calling it.
- `src/config.ts` is server only. Client components get its values as props.
- When a number, score or vote rule changes, update the site's How it works page (`src/app/(app)/about/page.tsx`) and [docs/how-it-works.md](docs/how-it-works.md).
- Tests and docs use the Sam/Alex/Jordan/Casey fixtures and made-up ids like `10000000000000000N`, never real people's names or Discord ids.

## Database migrations

1. Edit `src/db/schema.ts`, then `pnpm db:generate`.
2. If existing rows need values, append the backfill to the generated SQL file: end the `ALTER TABLE ...;` with `--> statement-breakpoint` and put the `UPDATE ...;` on the next line. Otherwise don't edit generated migrations.
3. Apply it locally: `pnpm db:migrate` (and `DATABASE_URL=file:discord-test.db pnpm db:migrate` if you have that database). If the running dev server errors on the new column, `touch next.config.ts` restarts it.
4. Keep changes additive: a nullable column, or one with a default or a backfill. Every group's production build applies new migrations before the new code goes live (`scripts/migrate-on-build.mjs`), so the old code is still serving against the new schema for a minute.

One-off data fixes (not schema changes) go in `scripts/` as a tsx script with an npm script (`tsx --conditions=react-server ...`). Load `.env.local` with `process.loadEnvFile` so variables already set win, which lets the same script run against production: `node scripts/with-env.mjs .env.production pnpm <script>`. Make them idempotent, and print what they changed.

## Good to know

- Scripts that import app code need `--conditions=react-server` (for `server-only`).
- Missing Tailwind classes after editing `@theme` in `globals.css` mean Turbopack's cache is stale: `rm -rf .next/dev`.
- This is Next.js 16 with Cache Components; some APIs differ from older versions. The docs that match the installed version are in `node_modules/next/dist/docs/`.

## Ideas to pick up

- **One ranking list** as a setting, for groups that don't want heavy and light games kept apart.
- **Signing in without Discord**, for groups that organize somewhere else.
