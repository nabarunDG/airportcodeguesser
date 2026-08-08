// Loads the build-time-trimmed dataset (public/airports.json, written by
// scripts/trim-data.mjs) as a same-origin static asset — fetched once,
// cached by the browser thereafter. See that script's header comment for why
// this is `fetch`-ed rather than statically `import`-ed into the JS bundle.
import type { Airport } from '../types';

let cache: Promise<Airport[]> | null = null;

/** Kicks off (or returns the in-flight/completed) dataset fetch. Safe to call from multiple places. */
export function loadAirports(): Promise<Airport[]> {
  if (!cache) {
    cache = fetch('/airports.json').then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} loading airports.json`);
      return res.json() as Promise<Airport[]>;
    });
  }
  return cache;
}

/** Clears the cached attempt so a failed load can be retried from scratch. */
export function resetAirportsCache(): void {
  cache = null;
}

let destNamesCache: Promise<Record<string, string>> | null = null;

/**
 * Cities for destinations the main dataset can't name — codes that appear as
 * route targets but are too small to be retained as airports themselves (see
 * buildDestinationNames in scripts/trim-data.mjs).
 *
 * Deliberately never allowed to reject: this only enriches a paid hint, so a
 * failed load degrades to bare 3-letter codes rather than breaking a round.
 * The game must not wait on it either — App.tsx gates boot on airports.json
 * alone.
 */
export function loadDestinationNames(): Promise<Record<string, string>> {
  if (!destNamesCache) {
    destNamesCache = fetch('/destination-names.json')
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, string>>) : {}))
      .catch(() => ({}));
  }
  return destNamesCache;
}

let cityIndexCache: Promise<Record<string, string>> | null = null;

/**
 * Towns and suburbs that have no airport of their own, mapped to the nearest
 * one — keyed "city|cc" (see scripts/build-city-index.mjs). Without it,
 * typing "Chapel Hill" or "Slough" at check-in matches nothing at all.
 *
 * Like loadDestinationNames, deliberately never allowed to reject: it only
 * widens what check-in can resolve, so a failed load degrades to airport-name
 * matching rather than blocking the player at the door.
 */
export function loadCityIndex(): Promise<Record<string, string>> {
  if (!cityIndexCache) {
    cityIndexCache = fetch('/city-airports.json')
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, string>>) : {}))
      .catch(() => ({}));
  }
  return cityIndexCache;
}

export function buildIndex(airports: Airport[]): Record<string, Airport> {
  const byCode: Record<string, Airport> = {};
  for (const a of airports) byCode[a.iata] = a;
  return byCode;
}

// Kick the fetch off immediately at module load — well before the player
// finishes reading the Home screen's copy, so by the time they tap "Start
// boarding" the data has almost always already arrived.
loadAirports().catch(() => {
  // Swallowed here; App.tsx's own load effect surfaces the error to the UI.
});

// Warmed alongside it, but nothing gates on either — see loadDestinationNames.
void loadDestinationNames();
void loadCityIndex();
