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
