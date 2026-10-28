@AGENTS.md
@CONTRIBUTING.md

Product docs, data flow and the file map are in docs/how-it-works.md. Read it before changing scoring, sync or votes.

## Working in this repo
- To check UI, run a copy of the repo from a scratch directory on another port against a copy of `local.db`, with its own `pnpm install` (Turbopack won't follow a symlinked `node_modules`), and sign in with the dev-login buttons (seeded users u-sam, u-alex, u-jordan, u-casey).
- Never put real Discord ids, member names, a group's production URL or a bot's client id in code, tests or docs. The same goes for the GitHub repo's settings: leave its description, website and topics without the production URL (`gh repo edit --homepage` included). The demo's URL (try-boardroom.vercel.app, a made-up group) isn't a group's production URL: it's fine in the README and as the repo's website.
