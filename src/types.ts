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

export type Screen = 'home' | 'checkin' | 'game' | 'reveal' | 'summary' | 'leaderboard';

/**
 * Difficulty modes (see docs/design-handoff §"New game rules"): General
 * Boarding re-weights the draw toward hubs and shows cities/names up front;
 * Frequent Flyer keeps reveal-on-demand and pays elite bonuses instead.
 */
export type Mode = 'gb' | 'ff';

export type ClueKey = 'car' | 'dest';
export type HintKey = 'country' | 'carrierNames' | 'destNames';

/** Additive bonuses earned across a batch — score may exceed 100 with these. */
export interface Bonuses {
  /** +10 per 3-correct streak (doubled in FF). */
  upgrades: number;
  /** Continents touched at batch end: 4 → +5, 5 → +10, all 6 → +15. */
  continents: number;
  /** +10 if any consecutive leg crossed the antimeridian. */
  dateLine: number;
  /** +10 if any single leg ran LONG_HAUL_KM or further. Once per batch, like dateLine. */
  longHaul: number;
  /** +20 flat at batch end in Frequent Flyer. */
  elite: number;
}

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
