#!/usr/bin/env node
// Fetches the community-maintained airline route dataset and trims it down to
// only the fields Gate Check actually uses, writing a single static JSON
// array to public/airports.json — served as a same-origin static asset
// (fetched once client-side, cached by the browser/CDN thereafter) and also
// imported directly by the Cloudflare Function for server-side IATA
// validation. See docs/design-handoff/README.md "Data pipeline". Re-run via
// `npm run data:refresh`; the monthly GitHub Action
// (.github/workflows/refresh-data.yml) reruns this and opens a PR if the
// output changed.
//
// Deliberately NOT statically `import`-ed into the React bundle: at ~2000+
// airports with full route/carrier detail this trims to several MB even
// after field-trimming, and inlining that into app.js would bloat/slow down
// parsing of the JS bundle itself on every visit. As a plain static asset it
// downloads once, in parallel with everything else, and is cached by the
// browser across sessions.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL = 'https://raw.githubusercontent.com/Jonty/airline-route-data/main/airline_routes.json';

// Eligibility floor for the *retained* dataset. Deliberately looser than the
// README's headline "≥8 routes" (that's a runtime gameplay constant — see
// src/lib/gameLogic.ts's MIN_BATCH_ROUTES/MIN_FILL_ROUTES/MIN_HUB_ROUTES).
// ≥3 matches what the prototype's own `this.all` actually retains, and is
// needed so small airports can still work as home-airport leaderboard entries
// and as route-lookup targets for fun facts, even though they'll never be
// picked as a guessable answer themselves.
const MIN_RETAINED_ROUTES = 3;

// Sanity floor: if the source ever returns something drastically smaller than
// expected (e.g. a truncated response, or the schema changed), bail instead
// of committing a broken dataset.
const MIN_PLAUSIBLE_COUNT = 500;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'airports.json');

function isEligible(a) {
  return Boolean(
    a &&
      typeof a.iata === 'string' &&
      a.iata.length === 3 &&
      a.name &&
      a.city_name &&
      Array.isArray(a.routes) &&
      a.routes.length >= MIN_RETAINED_ROUTES,
  );
}

function trimAirport(a) {
  return {
    iata: a.iata,
    name: a.name,
    city_name: a.city_name,
    country: a.country,
    country_code: a.country_code,
    continent: a.continent,
    latitude: Number(a.latitude),
    longitude: Number(a.longitude),
    elevation: Number(a.elevation) || 0,
    timezone: a.timezone,
    routes: a.routes.map((r) => ({
      iata: r.iata,
      km: Number(r.km) || 0,
      min: Number(r.min) || 0,
      carriers: Array.isArray(r.carriers)
        ? r.carriers
            .filter((c) => c && c.iata)
            .map((c) => ({ iata: c.iata, name: c.name || c.iata }))
        : [],
    })),
  };
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching source dataset`);
  }
  const json = await res.json();
  const all = Object.values(json);
  console.log(`Source dataset: ${all.length} entries`);

  const eligible = all.filter(isEligible);
  console.log(`Eligible (≥${MIN_RETAINED_ROUTES} routes, has iata/name/city_name): ${eligible.length}`);

  if (eligible.length < MIN_PLAUSIBLE_COUNT) {
    throw new Error(
      `Only ${eligible.length} eligible airports found — expected at least ${MIN_PLAUSIBLE_COUNT}. ` +
        `Refusing to write a possibly-broken dataset.`,
    );
  }

  const trimmed = eligible.map(trimAirport).sort((a, b) => (a.iata < b.iata ? -1 : 1));

  // Minified on purpose: this file ships as a static asset fetched directly
  // by the browser (see note above), so shaving whitespace shaves real bytes
  // off every player's one-time download. A ~2000-entry dataset diff isn't
  // meaningfully more reviewable pretty-printed than minified either way, so
  // there's no readability trade-off worth keeping for the monthly refresh PR.
  await writeFile(OUT_PATH, JSON.stringify(trimmed), 'utf8');
  console.log(`Wrote ${trimmed.length} airports to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('trim-data failed:', err);
  process.exitCode = 1;
});
