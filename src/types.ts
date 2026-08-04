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

export type ClueKey = 'dep' | 'car' | 'dest';
export type HintKey = 'sorted' | 'names' | 'cities' | 'country';

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
