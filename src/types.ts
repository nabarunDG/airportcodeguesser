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
