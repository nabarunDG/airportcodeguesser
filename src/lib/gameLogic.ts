// Pure game logic, ported from the design prototype's `Component` class
// (docs/design-handoff/design/Airport Code Guesser.dc.html, the
// `data-dc-script` block). No React, no I/O — safe to unit test directly.
//
// Two edge cases in the original were fixed rather than carried over
// verbatim (see the implementation plan's "porting" notes):
//   - `wpick([])` on an empty list is now explicit (`undefined`) instead of
//     relying on `list[-1]` silently returning `undefined` via JS's lack of
//     negative-index wraparound.
//   - the fallback-fill loop in `makeChoices` now bails after a bounded
//     number of attempts and tolerates `wpick` returning `undefined`,
//     instead of spinning unboundedly / crashing if it ever ran dry.

import type { Airport, Choice, Continent, Route } from '../types';

export const HINT_COST = 2;
export const CITY_REVEAL_COST = 1; // per-option "reveal this city" cost — see ChoiceList
export const MIN_BATCH_ROUTES = 8; // floor to be a batch answer/distractor
export const MIN_FILL_ROUTES = 20; // floor for random fallback-fill picks
export const MIN_HUB_ROUTES = 45; // floor to count as a "major hub"
export const BATCH_SIZE = 10;
export const REUSE_POOL_FLOOR = 80; // reset the used-set once the remaining pool drops below this

export const IDLE_NUDGE_SECONDS = 120;
export const IDLE_SKIP_SECONDS = 150;

export const CARRIER_DISPLAY_CAP = 28;
export const DEST_DISPLAY_CAP = 36;

export const CONTINENTS: Continent[] = ['NA', 'EU', 'AS', 'SA', 'AF', 'OC'];

export function shuffle<T>(list: T[]): T[] {
  const l = list.slice();
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/** Weighted-random pick, weight = routes.length² (biases toward larger airports). */
export function wpick(list: Airport[]): Airport | undefined {
  if (list.length === 0) return undefined;
  let total = 0;
  for (const a of list) total += a.routes.length * a.routes.length;
  if (total <= 0) return list[Math.floor(Math.random() * list.length)];
  let r = Math.random() * total;
  for (const a of list) {
    r -= a.routes.length * a.routes.length;
    if (r <= 0) return a;
  }
  return list[list.length - 1];
}

/**
 * Builds one batch of BATCH_SIZE airports: at least one major hub (if
 * available) + one per continent (if available), then weighted-random fill.
 * Mutates `used` (adds every airport placed into the batch); clears it first
 * if the remaining pool is too small to draw a fresh batch from.
 */
export function buildBatch(all: Airport[], used: Set<string>): Airport[] {
  let pool = all.filter((a) => a.routes.length >= MIN_BATCH_ROUTES && !used.has(a.iata));
  if (pool.length < REUSE_POOL_FLOOR) {
    used.clear();
    pool = all.filter((a) => a.routes.length >= MIN_BATCH_ROUTES);
  }

  const picked = new Set<string>();
  const batch: Airport[] = [];

  const hub = wpick(pool.filter((a) => a.routes.length >= MIN_HUB_ROUTES));
  if (hub) {
    picked.add(hub.iata);
    batch.push(hub);
  }

  for (const continent of CONTINENTS) {
    const candidate = wpick(pool.filter((a) => a.continent === continent && !picked.has(a.iata)));
    if (candidate) {
      picked.add(candidate.iata);
      batch.push(candidate);
    }
  }

  let attempts = 0;
  const maxAttempts = BATCH_SIZE * 10;
  while (batch.length < BATCH_SIZE && attempts < maxAttempts) {
    attempts++;
    const candidatePool = pool.filter((a) => !picked.has(a.iata));
    const candidate = wpick(candidatePool);
    if (!candidate) break;
    picked.add(candidate.iata);
    batch.push(candidate);
  }

  const shuffled = shuffle(batch);
  shuffled.forEach((a) => used.add(a.iata));
  return shuffled;
}

const MAX_CHOICE_FILL_ATTEMPTS = 200;

/**
 * Builds the 5 multiple-choice options for a round: the answer + 2 nearest
 * airports (Manhattan distance, excluding same city) + 1 sharing the
 * answer's airport-name first letter + 1 sharing the city-name first letter;
 * deduped by iata AND name; randomly filled (≥MIN_FILL_ROUTES routes) if
 * short; shuffled.
 */
export function makeChoices(all: Airport[], answer: Airport): Choice[] {
  const pool = all.filter(
    (a) => a.routes.length >= MIN_BATCH_ROUTES && a.iata !== answer.iata && a.name !== answer.name,
  );
  const lat = answer.latitude;
  const lon = answer.longitude;
  const manhattan = (a: Airport) => Math.abs(a.latitude - lat) + Math.abs(a.longitude - lon);

  const taken = new Set<string>([answer.iata]);
  const out: Airport[] = [];

  const take = (list: Airport[], n: number) => {
    const available = list.filter((a) => !taken.has(a.iata) && !out.some((o) => o.name === a.name));
    for (let k = 0; k < n && available.length; k++) {
      const j = Math.floor(Math.random() * available.length);
      const a = available.splice(j, 1)[0];
      taken.add(a.iata);
      out.push(a);
    }
  };

  take(
    pool
      .filter((a) => a.city_name !== answer.city_name)
      .sort((x, y) => manhattan(x) - manhattan(y))
      .slice(0, 10),
    2,
  );
  take(pool.filter((a) => a.name[0]?.toUpperCase() === answer.name[0]?.toUpperCase()), 1);
  take(pool.filter((a) => a.city_name[0]?.toUpperCase() === answer.city_name[0]?.toUpperCase()), 1);

  const fillPool = pool.filter((a) => a.routes.length >= MIN_FILL_ROUTES);
  let attempts = 0;
  while (out.length < 4 && attempts < MAX_CHOICE_FILL_ATTEMPTS) {
    attempts++;
    const pick = wpick(fillPool);
    if (!pick) break;
    take([pick], 1);
  }

  const choices: Choice[] = [...out.map((a) => ({ airport: a, ok: false })), { airport: answer, ok: true }];
  return shuffle(choices);
}

/** Picks one random applicable fun fact about the answer airport, derived from its route data. */
export function makeFact(answer: Airport, byCode: Record<string, Airport>): string {
  const facts: string[] = [];
  let longest: Route | null = null;
  let busiest: Route | null = null;
  for (const r of answer.routes) {
    if (!longest || r.km > longest.km) longest = r;
    if (!busiest || r.carriers.length > busiest.carriers.length) busiest = r;
  }
  const countries = new Set<string>();
  for (const r of answer.routes) {
    const dest = byCode[r.iata];
    if (dest) countries.add(dest.country);
  }

  if (longest && longest.km) {
    facts.push(
      `Its longest nonstop hop is ${longest.km.toLocaleString()} km to ${longest.iata} — about ${Math.round(longest.min / 60)} hours in the air.`,
    );
  }
  if (busiest && busiest.carriers.length > 1) {
    facts.push(`${busiest.carriers.length} different airlines compete on its busiest route, to ${busiest.iata}.`);
  }
  if (countries.size > 1) {
    facts.push(`You can fly nonstop from here to ${countries.size} countries.`);
  }
  if (answer.elevation > 1500) {
    facts.push(`At ${answer.elevation.toLocaleString()} m elevation, planes need a longer takeoff roll here.`);
  }
  if (facts.length === 0) {
    facts.push(`It serves ${answer.routes.length} nonstop destinations.`);
  }
  return facts[Math.floor(Math.random() * facts.length)];
}

export interface CarrierChip {
  code: string;
  name: string;
}

/** Every distinct carrier flying from the airport, shuffled once (stable for the round). */
export function buildCarrierList(airport: Airport): CarrierChip[] {
  const m = new Map<string, string>();
  for (const r of airport.routes) {
    for (const c of r.carriers) {
      if (c.iata) m.set(c.iata, c.name);
    }
  }
  return shuffle([...m.entries()].map(([code, name]) => ({ code, name })));
}

export interface DestEntry {
  code: string;
  n: number; // carrier count on that route ("traffic")
}

export function buildDestCache(airport: Airport): DestEntry[] {
  return airport.routes.map((r) => ({ code: r.iata, n: r.carriers.length || 1 }));
}

/** Estimated daily departures, bucketed ("N+", capped "300+") — the dataset has no true frequency numbers. */
export function departuresBucket(destCache: DestEntry[]): string {
  const deps = destCache.reduce((sum, d) => sum + d.n, 0);
  return deps >= 300 ? '300+' : `${Math.max(10, Math.floor(deps / 10) * 10)}+`;
}

/** Round score: 10 pts minus every hint/reveal cost spent this round, floored at 2. */
export function roundPoints(costSoFar: number): number {
  return Math.max(2, 10 - costSoFar);
}

const FF_TIERS = [
  'Standby',
  'Middle Seat',
  'Basic Economy',
  'Main Cabin',
  'Extra Legroom',
  'Silver Wings',
  'Gold Wings',
  'Platinum',
  'Diamond',
  'Million Miler',
];

/** Frequent Flyer status tier, by decade of batch score (0-100). */
export function ffTier(score: number): string {
  return FF_TIERS[Math.min(FF_TIERS.length - 1, Math.floor(score / 10))];
}

/** Boarding group: 90-100 pts boards Group 1, worse scores board later groups. */
export function boardGroup(score: number): number {
  return Math.max(1, 10 - Math.floor(score / 10));
}

export function fmtDur(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayDisplay(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export interface BarcodeBar {
  w: string;
  g: string;
}

/** A randomized boarding-pass barcode, regenerated once per batch. */
export function makeBarcode(count = 52): BarcodeBar[] {
  return Array.from({ length: count }, () => ({
    w: `${1 + Math.floor(Math.random() * 3)}px`,
    g: `${1 + Math.floor(Math.random() * 4)}px`,
  }));
}

/** Cockpit-dial needle rotation in degrees, -90 (0 pts) to +90 (100 pts). */
export function dialNeedleDeg(score: number): number {
  return -90 + (score / 100) * 180;
}

/** Cockpit-dial arc stroke-dashoffset (pathLength=100), so higher score = more arc filled. */
export function dialOffset(score: number): number {
  return 100 - score;
}
