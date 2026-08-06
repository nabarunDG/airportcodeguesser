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
export const HUB_TOP_FRACTION = 0.2; // "hub" = top 20% by route count *within its continent*
export const HUB_FLOOR_MIN = 20; // …but never below this many routes, however small the continent
export const BATCH_SIZE = 10;
export const REUSE_POOL_FLOOR = 80; // reset the used-set once the remaining pool drops below this

export const IDLE_NUDGE_SECONDS = 120;
export const IDLE_SKIP_SECONDS = 150;

export const CARRIER_DISPLAY_CAP = 28;
export const DEST_DISPLAY_CAP = 36;

export const CONTINENTS: Continent[] = ['NA', 'EU', 'AS', 'SA', 'AF', 'OC'];

/** RNG source, [0, 1) like Math.random — injectable for seeded tests / daily modes. */
export type Rng = () => number;

export function shuffle<T>(list: T[], rng: Rng = Math.random): T[] {
  const l = list.slice();
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/**
 * Weighted-random pick, weight = √routes.length. Sub-linear on purpose: it
 * keeps a mild bias toward larger (more guessable) airports without letting
 * mega-hubs monopolize a slot — under the old routes² weighting a 289-route
 * FRA outweighed a 45-route hub 41-to-1 and the same few airports appeared
 * every batch.
 */
export function wpick(list: Airport[], rng: Rng = Math.random): Airport | undefined {
  if (list.length === 0) return undefined;
  let total = 0;
  for (const a of list) total += Math.sqrt(a.routes.length);
  if (total <= 0) return list[Math.floor(rng() * list.length)];
  let r = rng() * total;
  for (const a of list) {
    r -= Math.sqrt(a.routes.length);
    if (r <= 0) return a;
  }
  return list[list.length - 1];
}

/**
 * Per-continent hub floors: the route count marking the top HUB_TOP_FRACTION
 * of the continent's pool, clamped to ≥ HUB_FLOOR_MIN. Relative rather than a
 * single global threshold, so "hub" means JNB or SYD in their own continents
 * as much as it means FRA in Europe (a global ≥45 floor left Africa with just
 * 12 eligible hubs vs Europe's 138).
 */
export function continentHubFloors(pool: Airport[]): Map<Continent, number> {
  const floors = new Map<Continent, number>();
  for (const continent of CONTINENTS) {
    const counts = pool
      .filter((a) => a.continent === continent)
      .map((a) => a.routes.length)
      .sort((x, y) => y - x);
    if (counts.length === 0) continue;
    const cutoff = counts[Math.min(counts.length - 1, Math.floor(counts.length * HUB_TOP_FRACTION))];
    floors.set(continent, Math.max(HUB_FLOOR_MIN, cutoff));
  }
  return floors;
}

/**
 * Builds one batch of BATCH_SIZE airports: one anchor hub from a uniformly
 * random continent (so the biggest name in the batch rotates between ATL-class
 * and ADD/GRU/SYD-class hubs) + one per continent + weighted-random fill,
 * ordered largest-first as a difficulty ramp. Mutates `used` (adds every
 * airport placed into the batch); clears it first if the remaining pool is
 * too small to draw a fresh batch from.
 */
export function buildBatch(all: Airport[], used: Set<string>, rng: Rng = Math.random): Airport[] {
  let pool = all.filter((a) => a.routes.length >= MIN_BATCH_ROUTES && !used.has(a.iata));
  if (pool.length < REUSE_POOL_FLOOR) {
    used.clear();
    pool = all.filter((a) => a.routes.length >= MIN_BATCH_ROUTES);
  }

  const picked = new Set<string>();
  const batch: Airport[] = [];
  const floors = continentHubFloors(pool);
  const isHub = (a: Airport) => {
    const floor = floors.get(a.continent as Continent);
    return floor !== undefined && a.routes.length >= floor;
  };

  const anchorContinent = CONTINENTS[Math.floor(rng() * CONTINENTS.length)];
  const hub =
    wpick(pool.filter((a) => a.continent === anchorContinent && isHub(a)), rng) ??
    wpick(pool.filter(isHub), rng);
  if (hub) {
    picked.add(hub.iata);
    batch.push(hub);
  }

  for (const continent of CONTINENTS) {
    const candidate = wpick(pool.filter((a) => a.continent === continent && !picked.has(a.iata)), rng);
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
    const candidate = wpick(candidatePool, rng);
    if (!candidate) break;
    picked.add(candidate.iata);
    batch.push(candidate);
  }

  // Largest-first difficulty ramp instead of a shuffle: round 1 is the anchor
  // hub, the last rounds are the regional airports — an obscure answer late
  // in the batch reads as "the hard ones", not as random unfairness.
  const ramped = batch.slice().sort((x, y) => y.routes.length - x.routes.length);
  ramped.forEach((a) => used.add(a.iata));
  return ramped;
}

const MAX_CHOICE_FILL_ATTEMPTS = 200;

/**
 * Builds the 5 multiple-choice options for a round: the answer + 2 nearest
 * airports (Manhattan distance, excluding same city) + 1 sharing the
 * answer's airport-name first letter + 1 sharing the city-name first letter;
 * deduped by iata AND name; randomly filled (≥MIN_FILL_ROUTES routes) if
 * short; shuffled.
 *
 * When the answer is a small regional airport, every one of those picks
 * prefers its own continent, because a lone unfamiliar name among four
 * world-famous hubs gives the answer away by elimination. Each preference
 * falls back to the global pool if the regional candidates run out, so the
 * option count never suffers for it.
 *
 * `exclude` keeps the rest of the current batch out of the options — seeing
 * round 7's answer sitting in round 2's wrong options spoils it.
 */
export function makeChoices(
  all: Airport[],
  answer: Airport,
  exclude?: ReadonlySet<string>,
  rng: Rng = Math.random,
): Choice[] {
  const pool = all.filter(
    (a) =>
      a.routes.length >= MIN_BATCH_ROUTES &&
      a.iata !== answer.iata &&
      a.name !== answer.name &&
      !exclude?.has(a.iata),
  );
  const lat = answer.latitude;
  const lon = answer.longitude;
  const manhattan = (a: Airport) => Math.abs(a.latitude - lat) + Math.abs(a.longitude - lon);
  const preferRegional = answer.routes.length < MIN_FILL_ROUTES;

  const taken = new Set<string>([answer.iata]);
  const out: Airport[] = [];

  const take = (list: Airport[], n: number) => {
    const available = list.filter((a) => !taken.has(a.iata) && !out.some((o) => o.name === a.name));
    for (let k = 0; k < n && available.length; k++) {
      const j = Math.floor(rng() * available.length);
      const a = available.splice(j, 1)[0];
      taken.add(a.iata);
      out.push(a);
    }
  };

  /** Takes `n` from `list`, exhausting same-continent candidates first for a regional answer. */
  const takePreferRegional = (list: Airport[], n: number) => {
    const before = out.length;
    if (preferRegional) take(list.filter((a) => a.continent === answer.continent), n);
    take(list, n - (out.length - before));
  };

  takePreferRegional(
    pool
      .filter((a) => a.city_name !== answer.city_name)
      .sort((x, y) => manhattan(x) - manhattan(y))
      .slice(0, 10),
    2,
  );
  takePreferRegional(pool.filter((a) => a.name[0]?.toUpperCase() === answer.name[0]?.toUpperCase()), 1);
  takePreferRegional(pool.filter((a) => a.city_name[0]?.toUpperCase() === answer.city_name[0]?.toUpperCase()), 1);

  const globalFill = pool.filter((a) => a.routes.length >= MIN_FILL_ROUTES);
  const fillPools = preferRegional
    ? [globalFill.filter((a) => a.continent === answer.continent), globalFill]
    : [globalFill];
  for (const fillPool of fillPools) {
    let attempts = 0;
    while (out.length < 4 && attempts < MAX_CHOICE_FILL_ATTEMPTS) {
      attempts++;
      const pick = wpick(fillPool, rng);
      if (!pick) break;
      take([pick], 1);
    }
  }

  const choices: Choice[] = [...out.map((a) => ({ airport: a, ok: false })), { airport: answer, ok: true }];
  return shuffle(choices, rng);
}

// The dataset's `elevation` is in FEET, not metres — La Paz reads 13,313 and
// Amsterdam −11. The original port (and the design handoff it came from)
// printed it as "m", which claimed Denver sat at 5,389 m: higher than any
// airport on earth. The threshold was wrong for the same reason — 1,500 read
// as feet fires for 406 of 2,147 airports, most of them unremarkable. 1,500 m
// is the height actually worth a remark about takeoff rolls.
const FT_PER_M_INVERSE = 0.3048;
const HIGH_ELEVATION_FT = Math.round(1500 / FT_PER_M_INVERSE); // ≈4,921 ft

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
  if (answer.elevation > HIGH_ELEVATION_FT) {
    const metres = Math.round(answer.elevation * FT_PER_M_INVERSE);
    facts.push(
      `At ${answer.elevation.toLocaleString()} ft (${metres.toLocaleString()} m) elevation, planes need a longer takeoff roll here.`,
    );
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

/**
 * Frequent Flyer tiers as [minimum score, name], highest first.
 *
 * Originally one tier per decade of score, which distributed badly in practice:
 * real scores bunch at the top (a player who knows the codes takes 10 pts a
 * round and only spends hints when stuck), so most batches landed in the top
 * two or three tiers and Million Miler stopped meaning anything.
 *
 * Recalibrated so Standby absorbs everything below half marks, and the nine
 * tiers above it get progressively narrower — 8 points wide at the bottom
 * down to 3 at the top. Million Miler now needs 98, which is at most a couple
 * of city reveals across ten rounds.
 */
const FF_TIERS: ReadonlyArray<readonly [number, string]> = [
  [98, 'Million Miler'],
  [93, 'Diamond'],
  [88, 'Platinum'],
  [83, 'Gold Wings'],
  [78, 'Silver Wings'],
  [72, 'Extra Legroom'],
  [65, 'Main Cabin'],
  [58, 'Basic Economy'],
  [50, 'Middle Seat'],
  [0, 'Standby'],
];

/** Frequent Flyer status tier for a batch score (0-100). */
export function ffTier(score: number): string {
  const tier = FF_TIERS.find(([min]) => score >= min);
  return (tier ?? FF_TIERS[FF_TIERS.length - 1])[1];
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

/** Adds `days` (may be negative) to a 'YYYY-MM-DD' UTC date string, returning the same format. */
export function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday (ISO week start) of the current UTC week, as 'YYYY-MM-DD'. The leaderboard's aggregation window. */
export function weekStartUTC(): string {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = (utcDay + 6) % 7; // days since the most recent Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

/** Sunday (ISO week end) of the current UTC week — the inclusive upper bound paired with weekStartUTC(). */
export function weekEndUTC(): string {
  return addDaysUTC(weekStartUTC(), 6);
}

/** Human-readable week range for the leaderboard header, e.g. "Aug 3–9, 2026". */
export function weekRangeDisplay(): string {
  const start = weekStartUTC();
  const end = weekEndUTC();
  const [sy, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  const startDt = new Date(Date.UTC(sy, sm - 1, sd));
  const endDt = new Date(Date.UTC(sy, em - 1, ed));
  const startStr = startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  // Same month: "Aug 3–9, 2026"; different month: "Aug 31 – Sep 6, 2026".
  const endStr =
    sm === em
      ? endDt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
      : endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${startStr}–${endStr}, ${sy}`;
}

export function todayDisplay(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Cockpit-dial needle rotation in degrees, -90 (0 pts) to +90 (100 pts). */
export function dialNeedleDeg(score: number): number {
  return -90 + (score / 100) * 180;
}

/** Cockpit-dial arc stroke-dashoffset (pathLength=100), so higher score = more arc filled. */
export function dialOffset(score: number): number {
  return 100 - score;
}
