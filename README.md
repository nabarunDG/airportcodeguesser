# Gate Check

Guess the airport behind a 3-letter IATA code, using real contextual clues —
local time, weather, carriers, routes — instead of bare letters. Batches of
10 rounds, 10 pts per correct answer, optional hints that cost 2 pts. No
countdown pressure; a gentle idle nudge eventually skips a round. Daily
collective leaderboard aggregated by players' home airports.

Built from the design handoff in `docs/design-handoff/` — see that
README.md for the full product spec (screens, design tokens, and the original
game rules; the selection rules below supersede part of it).

## Airport selection

Which 10 airports a batch draws, and in what order, is all in
`src/lib/gameLogic.ts` (pure functions, covered by `gameLogic.test.ts`):

- **Weighting is `√routes`, not `routes²`.** The original squared weighting
  meant a 289-route hub outweighed a 45-route one 41-to-1, so Africa took
  2.6% of the draw weight despite being 7.5% of the eligible pool, and the
  same dozen mega-hubs appeared in every batch. Square-root weighting keeps a
  mild bias toward recognizable airports without the lock-in.
- **"Hub" is relative to its continent** (top 20% by route count, floor 20),
  not a global ≥45 threshold — that global bar left Africa 12 eligible hubs
  against Europe's 138. Each batch opens with one hub drawn from a *uniformly
  random* continent, so the marquee airport rotates between ATL-class and
  ADD/GRU/SYD-class.
- **Rounds are ordered largest-first** as a difficulty ramp, rather than
  shuffled, and a small regional answer gets same-continent distractors plus a
  free country hint — otherwise the one unfamiliar name among four famous ones
  is the answer by elimination.
- **Repeats** are suppressed across three UTC days, counting distractors as
  seen, and no batch member can appear as another round's wrong option.

Measured over 3,000 simulated batches, this moved Africa from 1.10 to 1.35
airports per batch (South America 1.05→1.28, Oceania 1.03→1.23, Europe
2.73→2.13), and widened the airports that ever appear from 927 to all 1,219
in the eligible pool. The busiest single airport dropped from 2.7% of all
slots to 1.1%.

## Passport stamps

Every correct answer earns a stamp. They are **collectibles and carry no
points** — the batch ceiling is still 100 — so the score never becomes a
function of which countries a batch happened to draw.

Six dies live in `src/lib/stampTemplates.ts`, one per continent, each with its
own shape, ink pair, typeface and ornament, filled from slots already on the
airport record (`iata`, `city_name`, `country`, the month, and for the three
wide dies a coordinate pair or the field elevation). A filled passport page
therefore shows at a glance how far the batch ranged. Ink is a *pair* because
true ink is dark and so is the boarding pass: `.gc-on-paper` selects the real
hue, everything else gets a lifted variant of it. Tilt and the worn-rubber
mask are hashed from the IATA code, so an airport always stamps identically.

At the end of a batch the passport opens over the summary, lands the stamps in
the order they were earned, then folds away into the compact row on the
boarding pass. It's a transition rather than a permanent block on purpose —
that screen's fixed space belongs to the boarding pass and Flight Leaders, and
a full spread would push the leaderboard past two phone screens.

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
   apply the migrations (`npm run d1:migrate:remote` — run this again after
   any new file lands in `migrations/`), and bind it to the
   Pages project (Settings → Functions → D1 database bindings) for both
   Production and Preview — update `wrangler.toml`'s `database_id` to match.
4. Add a custom domain to the Pages project; Cloudflare issues SSL
   automatically.

Every push to `main` auto-deploys from then on — no server to maintain.

## Usage stats (internal, no third-party analytics)

Two first-party endpoints write anonymous, aggregate-only data to D1 — no
analytics script, no PII, both reusing the same anonymous player id as the
leaderboard, neither shown anywhere in the app:

- `POST /api/ping` → `visits`: unique visitors and time on site per UTC day.
- `POST /api/batch` → `batches`: one row per finished batch (duration to the
  final answer, score, correct count, hints used, stamps earned). Fired
  whether or not the player posts a leaderboard score, so it covers every
  batch played rather than only submitted ones.

To check the numbers:

- **Cloudflare dashboard** — open the `gatecheck-leaderboard` D1 database →
  Console tab → run SQL directly.
- **CLI** — `wrangler d1 execute gatecheck-leaderboard --remote --command "SELECT day, COUNT(DISTINCT player_id) AS unique_users, SUM(seconds) AS total_seconds FROM visits GROUP BY day ORDER BY day"`
  (and for gameplay: `"SELECT day, COUNT(*) AS batches, AVG(duration_seconds) AS avg_secs, AVG(score) AS avg_score FROM batches GROUP BY day ORDER BY day"`)
- **A file on GitHub** — `.github/workflows/stats-snapshot.yml` runs daily
  (and on manual dispatch), re-queries D1, and commits the result straight
  to `main` as `stats/daily-usage.json` — a browsable, versioned history
  with no dashboard access needed. Requires two repo secrets:
  `CLOUDFLARE_API_TOKEN` (D1 read access) and `CLOUDFLARE_ACCOUNT_ID`.
