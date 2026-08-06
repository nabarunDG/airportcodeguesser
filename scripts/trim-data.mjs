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
// src/lib/gameLogic.ts's MIN_BATCH_ROUTES/MIN_FILL_ROUTES).
// ≥3 matches what the prototype's own `this.all` actually retains, and is
// needed so small airports can still work as home-airport leaderboard entries
// and as route-lookup targets for fun facts, even though they'll never be
// picked as a guessable answer themselves.
const MIN_RETAINED_ROUTES = 3;

// Sanity floor: if the source ever returns something drastically smaller than
// expected (e.g. a truncated response, or the schema changed), bail instead
// of committing a broken dataset.
const MIN_PLAUSIBLE_COUNT = 500;

const CONTINENTS = ['NA', 'EU', 'AS', 'SA', 'AF', 'OC'];

// A handful of source records have a null/blank `continent`. That matters more
// than it looks: buildBatch() guarantees one slot per continent, so an airport
// with no continent can never win a guaranteed slot (see src/lib/gameLogic.ts).
// Most are recoverable from their own country — see backfillContinents() —
// which leaves only countries that have no other airport in the dataset to
// vote. Those need an explicit answer; anything not covered here is reported
// by the run so this list can be extended after a refresh.
const COUNTRY_CONTINENT_FALLBACK = {
  AO: 'AF', // Angola — NBJ is its only entry
  MD: 'EU', // Republic of Moldova — RMO is its only entry
};

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

/**
 * Fills in missing `continent` values in place. Each gap is resolved by
 * majority vote among the other airports in the same country (self-healing:
 * no country list to maintain as the source data shifts), falling back to
 * COUNTRY_CONTINENT_FALLBACK for countries with no other entry. Returns the
 * IATA codes it could not resolve so the caller can report them.
 */
function backfillContinents(airports) {
  const votesByCountry = new Map();
  for (const a of airports) {
    if (!CONTINENTS.includes(a.continent)) continue;
    const votes = votesByCountry.get(a.country_code) ?? new Map();
    votes.set(a.continent, (votes.get(a.continent) ?? 0) + 1);
    votesByCountry.set(a.country_code, votes);
  }

  const unresolved = [];
  let filled = 0;
  for (const a of airports) {
    if (CONTINENTS.includes(a.continent)) continue;
    const votes = votesByCountry.get(a.country_code);
    const winner = votes ? [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0] : COUNTRY_CONTINENT_FALLBACK[a.country_code];
    if (winner) {
      a.continent = winner;
      filled++;
    } else {
      unresolved.push(`${a.iata} (${a.country} / ${a.country_code})`);
    }
  }
  return { filled, unresolved };
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

  const { filled, unresolved } = backfillContinents(trimmed);
  console.log(`Backfilled continent for ${filled} airport(s) with a missing value`);
  if (unresolved.length) {
    console.warn(
      `WARNING: ${unresolved.length} airport(s) still have no continent and can never win a guaranteed ` +
        `per-continent batch slot. Add their country to COUNTRY_CONTINENT_FALLBACK in this script:\n  ` +
        unresolved.join('\n  '),
    );
  }

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
