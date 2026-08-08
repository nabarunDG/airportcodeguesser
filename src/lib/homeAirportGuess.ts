// The opening guess for check-in, so the screen arrives with an answer
// already in it instead of an empty text box.
//
// Check-in gates round 1, and a blank required field is the worst possible
// front door for a casual game. Three signals are tried in order, each
// weaker and each optional — the point is that *something* is always
// selected, and the player only ever has to correct it:
//
//   1. the airport they picked last time (localStorage)
//   2. Cloudflare's edge location for this connection (/api/where) — no
//      browser permission prompt, coarse but usually right
//   3. the browser's timezone, matched against the dataset's own timezone
//      field — no network at all, so it still works offline and in `vite dev`
//      where there is no Functions layer
//
// Device GPS is deliberately NOT here: it prompts, so it only ever runs from
// an explicit tap (see useGeolocation).
//
// PRIVACY: nothing here is persisted except the airport the player confirms.
// The coordinates from /api/where are used to sort a list and then discarded.
import type { Airport } from '../types';
import { airportsInTimezone, nearestAirports } from './gameLogic';

export type GuessSource = 'saved' | 'connection' | 'timezone' | 'none';

export interface HomeGuess {
  /** Best single suggestion, pre-selected on the check-in screen. */
  airport: Airport | null;
  /** Runners-up, so an approximate guess is correctable in one tap. */
  candidates: Airport[];
  source: GuessSource;
}

const EMPTY: HomeGuess = { airport: null, candidates: [], source: 'none' };

interface EdgeLocation {
  lat?: number;
  lon?: number;
  city?: string;
  country?: string;
}

/**
 * Approximate location from the edge. Returns null on anything unexpected —
 * a 404 (no Functions under `vite dev`), an empty body (`request.cf` absent
 * under `wrangler pages dev`), a network failure, or malformed JSON. Never
 * throws, never blocks: the caller just falls through to the next signal.
 */
async function fetchEdgeLocation(): Promise<EdgeLocation | null> {
  try {
    const res = await fetch('/api/where', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as EdgeLocation;
    return typeof body?.lat === 'number' && typeof body?.lon === 'number' ? body : null;
  } catch {
    return null;
  }
}

/** The browser's IANA zone, e.g. "America/New_York". Undefined on very old browsers. */
export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Walks the signals above and returns the first that produces an airport.
 * `saved` short-circuits everything — a returning player's own choice beats
 * any guess we could make.
 */
export async function guessHomeAirport(airports: Airport[], saved: Airport | null): Promise<HomeGuess> {
  if (saved) return { airport: saved, candidates: [saved], source: 'saved' };
  if (airports.length === 0) return EMPTY;

  const edge = await fetchEdgeLocation();
  if (edge?.lat != null && edge?.lon != null) {
    const nearby = nearestAirports(airports, edge.lat, edge.lon);
    if (nearby.length > 0) {
      return { airport: nearby[0].airport, candidates: nearby.map((n) => n.airport), source: 'connection' };
    }
  }

  const tz = browserTimezone();
  if (tz) {
    // Largest-first within the zone: a coarse shortlist to pick from, not a
    // claim about where the player actually is.
    const inZone = airportsInTimezone(airports, tz);
    if (inZone.length > 0) {
      return { airport: inZone[0], candidates: inZone, source: 'timezone' };
    }
  }

  return EMPTY;
}
