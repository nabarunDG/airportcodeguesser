# Gate Check

Guess the airport behind a 3-letter IATA code, using real contextual clues —
local time, weather, carriers, routes — instead of bare letters. Batches of
10 rounds, 10 pts per correct answer, optional hints that cost 2 pts. No
countdown pressure; a gentle idle nudge eventually skips a round. Daily
collective leaderboard aggregated by players' home airports.

Built from the design handoff in `docs/design-handoff/` — see that
README.md for the full product spec (game rules, screens, design tokens).

## Stack

- **Frontend:** React + Vite + TypeScript, plain CSS (Nocturne design
  tokens, ported verbatim into `src/styles/`).
- **Hosting + backend:** Cloudflare Pages (static build + custom domain) +
  Pages Functions (`functions/api/*.ts`) + D1 (`migrations/0001_init.sql`)
  for the leaderboard. One vendor, one dashboard, $0 at this scale.
- **Data:** `public/airports.json` is a build-time-trimmed copy of the
  [airline-route-data](https://github.com/Jonty/airline-route-data) dataset
  (see `scripts/trim-data.mjs`), refreshed monthly by
  `.github/workflows/refresh-data.yml` via an automated pull request.

## Local development

```bash
npm install
npm run dev          # frontend only — fast HMR, localStorage-backed leaderboard stand-in
```

To exercise the real backend locally (Cloudflare Functions + a local D1
database):

```bash
npm run d1:migrate:local   # first time only (or after a schema change)
npm run pages:dev          # builds, then serves via wrangler pages dev
```

To refresh the bundled dataset by hand (normally handled by the monthly
Action):

```bash
npm run data:refresh
```

## Deploying

1. Push this repo to GitHub.
2. Create a Cloudflare Pages project connected to it — build command
   `npm run build`, output directory `dist`.
3. Create the D1 database (`wrangler d1 create gatecheck-leaderboard`),
   apply the migration (`npm run d1:migrate:remote`), and bind it to the
   Pages project (Settings → Functions → D1 database bindings) for both
   Production and Preview — update `wrangler.toml`'s `database_id` to match.
4. Add a custom domain to the Pages project; Cloudflare issues SSL
   automatically.

Every push to `main` auto-deploys from then on — no server to maintain.
