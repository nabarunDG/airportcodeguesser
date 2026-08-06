// Core data shapes. Mirrors the trimmed fields written by scripts/trim-data.mjs
// into data/airports.json (see README.md's "Data pipeline" section).

export type Continent = 'NA' | 'EU' | 'AS' | 'SA' | 'AF' | 'OC';

export interface Carrier {
  iata: string;
  name: string;
}

export interface Route {
  iata: string;
  km: number;
  min: number;
  carriers: Carrier[];
}

export interface Airport {
  iata: string;
  name: string;
  city_name: string;
  country: string;
  country_code: string;
  continent: Continent | string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  routes: Route[];
}

/** The airport fields a passport-stamp die can print. See src/lib/stampTemplates.ts. */
export interface StampSlots {
  code: string;
  city: string;
  country: string;
  /** Month and year, e.g. 'AUG 2026'. */
  date: string;
  coords: string;
  /** Field elevation. NB the dataset's `elevation` is in FEET. */
  elev: string;
}

/**
 * One earned passport stamp. Carries everything its die needs to print, so
 * the summary can re-render a batch's stamps without going back to the
 * dataset. Worth no points by design — a collectible, not currency.
 */
export interface StampRecord {
  iata: string;
  continent: Continent | string;
  /** First correct answer in this country today — only these get the reveal-screen press. */
  firstVisit: boolean;
  slots: StampSlots;
}

export type Screen = 'home' | 'game' | 'reveal' | 'summary' | 'leaderboard';

export type ClueKey = 'car' | 'dest';
export type HintKey = 'country' | 'carrierNames' | 'destNames';

export interface Choice {
  airport: Airport;
  ok: boolean;
}

export interface LeaderboardRow {
  rank: number;
  airport: string;
  score: number;
  rounds: number;
  pax: number;
  avg: number;
  you: boolean;
}

export type LbSort = 'total' | 'avg';
export type LbDir = 'asc' | 'desc';

/** Same-day activity signal shown alongside the (now weekly) leaderboard — see leaderboardClient.ts. */
export interface TodayStats {
  pax: number;
  points: number;
}
