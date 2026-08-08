#!/usr/bin/env node
// Builds public/city-airports.json — a lookup from city name to the nearest
// airport, so check-in resolves places that aren't themselves airport cities.
//
// The airport dataset only knows the ~2,000 cities that have an airport named
// after them, which means a player in Chapel Hill, Brooklyn, Palo Alto or
// Slough types their home town and gets nothing. This index closes that gap:
// GeoNames' cities15000 (every place over 15,000 people) resolved to its
// nearest airport by great-circle distance.
//
// Only cities the airport dataset can't already answer are kept, and only
// where an airport is within MAX_DISTANCE_KM — a city in the middle of a
// continent with no airport for 400 km is better left unmatched than pointed
// somewhere useless. That trims ~25,000 GeoNames records to roughly 9,000
// entries.
//
// Run AFTER `npm run data:refresh`: this reads public/airports.json for the
// airport coordinates. Re-run via `npm run data:cities`.
//
// SOURCE LICENSE: GeoNames is CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
// and REQUIRES attribution. The credit lives in README.md — keep it there.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const SOURCE_URL = 'https://download.geonames.org/export/dump/cities15000.zip';

/** Beyond this, "nearest airport" stops being a useful answer. */
const MAX_DISTANCE_KM = 150;

/** Sanity floor: bail rather than commit a truncated index. */
const MIN_PLAUSIBLE_COUNT = 4000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AIRPORTS_PATH = path.join(__dirname, '..', 'public', 'airports.json');
const OUT_PATH = path.join(__dirname, '..', 'public', 'city-airports.json');

const EARTH_RADIUS_KM = 6371;

/** Same haversine as src/lib/gameLogic.ts — duplicated because build scripts don't import from src/. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Must match normalize() in src/lib/gameLogic.ts, or lookups will miss. */
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Buckets airports into 5° lat/lon cells so each city only measures against
 * nearby candidates. Brute force is 25,000 × 2,147 ≈ 54M haversines; this is
 * a couple of hundred thousand.
 */
function buildGrid(airports) {
  const grid = new Map();
  for (const a of airports) {
    const key = `${Math.floor(a.latitude / 5)}|${Math.floor(a.longitude / 5)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(a);
  }
  return grid;
}

function nearestAirport(grid, lat, lon) {
  const cellLat = Math.floor(lat / 5);
  const cellLon = Math.floor(lon / 5);
  let best = null;
  let bestKm = Infinity;
  // 3×3 cells = ±5°, comfortably wider than MAX_DISTANCE_KM at any latitude.
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      for (const a of grid.get(`${cellLat + dLat}|${cellLon + dLon}`) ?? []) {
        const km = haversineKm(lat, lon, a.latitude, a.longitude);
        if (km < bestKm) {
          bestKm = km;
          best = a;
        }
      }
    }
  }
  return best && bestKm <= MAX_DISTANCE_KM ? { airport: best, km: bestKm } : null;
}

/**
 * Extracts the first file from a ZIP archive. GeoNames only publishes .zip
 * and Node has no built-in archive reader, but these archives hold a single
 * deflated .txt — small enough to justify twenty lines of header parsing over
 * a new dependency in the build.
 *
 * Reads sizes from the central directory rather than the local header, since
 * a streamed-out archive may leave the local header's sizes zeroed.
 */
function unzipFirstEntry(buf) {
  // End of central directory: scan back from the tail for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65557; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)');

  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');

  const method = buf.readUInt16LE(cd + 10);
  const compressedSize = buf.readUInt32LE(cd + 20);
  const localOffset = buf.readUInt32LE(cd + 42);

  // The local header repeats the name/extra lengths, and they can differ from
  // the central directory's — always measure the data offset from the local one.
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compressedSize);

  if (method === 0) return data.toString('utf8'); // stored
  if (method === 8) return inflateRawSync(data).toString('utf8'); // deflate
  throw new Error(`Unsupported ZIP compression method ${method}`);
}

async function fetchCities() {
  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${SOURCE_URL}`);
  return unzipFirstEntry(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const airports = JSON.parse(await readFile(AIRPORTS_PATH, 'utf8'));
  console.log(`Loaded ${airports.length} airports from ${AIRPORTS_PATH}`);

  // Cities the airport dataset already answers need no entry — searchAirports
  // finds them directly, and duplicating them would only bloat the download.
  const knownCities = new Set(airports.map((a) => normalize(a.city_name)));
  const grid = buildGrid(airports);

  const raw = await fetchCities();
  const lines = raw.split('\n').filter(Boolean);
  console.log(`Source dataset: ${lines.length} places`);

  // Keyed by "city|cc" so same-named cities in different countries each
  // resolve; the client tries the country-qualified key, then the bare city.
  // Population is tracked alongside because GeoNames is ordered by id, NOT by
  // population — without this, Pasadena, Maryland (25k) beats Pasadena,
  // California (138k) purely by appearing first, and sends the player to BWI.
  const best = new Map();
  let skippedKnown = 0;
  let skippedFar = 0;

  for (const line of lines) {
    // GeoNames tab-separated columns: 1 name, 4 lat, 5 lon, 8 country, 14 population.
    const col = line.split('\t');
    const name = col[1];
    const lat = Number(col[4]);
    const lon = Number(col[5]);
    const country = col[8];
    const population = Number(col[14]) || 0;
    if (!name || !country || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const city = normalize(name);
    if (knownCities.has(city)) {
      skippedKnown++;
      continue;
    }
    const key = `${city}|${country.toLowerCase()}`;
    const incumbent = best.get(key);
    if (incumbent && incumbent.population >= population) continue;

    const near = nearestAirport(grid, lat, lon);
    if (!near) {
      skippedFar++;
      continue;
    }
    best.set(key, { iata: near.airport.iata, population });
  }

  const index = Object.fromEntries([...best.entries()].map(([key, v]) => [key, v.iata]));
  const count = Object.keys(index).length;
  console.log(`Skipped ${skippedKnown} already-an-airport-city, ${skippedFar} with no airport within ${MAX_DISTANCE_KM} km`);

  if (count < MIN_PLAUSIBLE_COUNT) {
    throw new Error(
      `Only ${count} city entries built — expected at least ${MIN_PLAUSIBLE_COUNT}. ` +
        `Refusing to write a possibly-broken index.`,
    );
  }

  // Minified for the same reason as airports.json: it ships as a static asset
  // fetched by the browser.
  await writeFile(OUT_PATH, JSON.stringify(index), 'utf8');
  const kb = Math.round(Buffer.byteLength(JSON.stringify(index)) / 1024);
  console.log(`Wrote ${count} city→airport entries (${kb} KB) to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
