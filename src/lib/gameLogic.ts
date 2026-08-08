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

import type { Airport, Choice, Continent, Mode, Route } from '../types';

export const MIN_BATCH_ROUTES = 8; // floor to be a batch answer/distractor
export const MIN_FILL_ROUTES = 20; // floor for random fallback-fill picks
export const HUB_TOP_FRACTION = 0.2; // "hub" = top 20% by route count *within its continent*
export const HUB_FLOOR_MIN = 20; // …but never below this many routes, however small the continent
export const BATCH_SIZE = 10;
export const REUSE_POOL_FLOOR = 80; // reset the used-set once the remaining pool drops below this

export const IDLE_NUDGE_SECONDS = 120;
export const IDLE_SKIP_SECONDS = 150;
/** Idle time with zero clues pulled before the "clues are free" toast — well before the 120s taxi-away flow. */
export const CLUE_NUDGE_SECONDS = 45;

/** Base points per correct answer. GB never deducts; FF's paid reveals subtract via roundPoints. */
export const ROUND_POINTS = 10;
/** Frequent Flyer's one priced reveal: a city hint. Everything else in both modes is free. */
export const FF_CITY_HINT_COST = 1;

/** Round score: base minus the reveal costs spent this round (FF only), floored at 2. */
export function roundPoints(costSoFar: number): number {
  return Math.max(2, ROUND_POINTS - costSoFar);
}
export const STREAK_LENGTH = 3; // consecutive corrects per upgrade bonus
export const UPGRADE_BONUS = 10; // +10 per 3-streak (doubled in FF)
export const DATE_LINE_BONUS = 10;
/** A single leg this far or further earns the long-haul bonus. */
export const LONG_HAUL_KM = 10_000;
export const LONG_HAUL_BONUS = 10;
export const ELITE_BONUS = 20; // FF flat bonus at batch end
/** GB draw: extra weight multiplier for the player's own continent. */
export const HOME_CONTINENT_WEIGHT = 1.2;
/** Random gate for the Oregon-Trail event lines — a treat, not wallpaper. */
export const EVENT_LINE_CHANCE = 0.4;

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

/** Per-airport draw weight — see wpick. */
export type WeightFn = (a: Airport) => number;

const SQRT_ROUTES: WeightFn = (a) => Math.sqrt(a.routes.length);

/**
 * Weighted-random pick, default weight = √routes.length. Sub-linear on
 * purpose: it keeps a mild bias toward larger (more guessable) airports
 * without letting mega-hubs monopolize a slot — under the old routes²
 * weighting a 289-route FRA outweighed a 45-route hub 41-to-1 and the same
 * few airports appeared every batch. General Boarding passes a linear weight
 * instead (see batchWeightFn) — friendlier skies mean more major hubs.
 */
export function wpick(list: Airport[], rng: Rng = Math.random, weight: WeightFn = SQRT_ROUTES): Airport | undefined {
  if (list.length === 0) return undefined;
  let total = 0;
  for (const a of list) total += weight(a);
  if (total <= 0) return list[Math.floor(rng() * list.length)];
  let r = rng() * total;
  for (const a of list) {
    r -= weight(a);
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

export interface BatchOptions {
  /** GB re-weights the draw toward hubs; FF keeps the classic √routes draw. */
  mode?: Mode;
  /** Player's home continent (from check-in) — GB gives it ~+20% draw weight. */
  homeContinent?: Continent | string;
}

/**
 * The draw weight for a batch slot. GB weights `routes` linearly (major hubs
 * come up far more often) and nudges the player's own continent up by
 * HOME_CONTINENT_WEIGHT; FF keeps the classic sub-linear √routes weight.
 */
export function batchWeightFn({ mode, homeContinent }: BatchOptions): WeightFn {
  const base: WeightFn = mode === 'gb' ? (a) => a.routes.length : SQRT_ROUTES;
  if (mode === 'gb' && homeContinent) {
    return (a) => base(a) * (a.continent === homeContinent ? HOME_CONTINENT_WEIGHT : 1);
  }
  return base;
}

/**
 * Builds one batch of BATCH_SIZE airports: one anchor hub from a uniformly
 * random continent (so the biggest name in the batch rotates between ATL-class
 * and ADD/GRU/SYD-class hubs) + one per continent + weighted-random fill,
 * ordered largest-first as a difficulty ramp. Mutates `used` (adds every
 * airport placed into the batch); clears it first if the remaining pool is
 * too small to draw a fresh batch from.
 */
export function buildBatch(all: Airport[], used: Set<string>, rng: Rng = Math.random, opts: BatchOptions = {}): Airport[] {
  const weight = batchWeightFn(opts);
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
    wpick(pool.filter((a) => a.continent === anchorContinent && isHub(a)), rng, weight) ??
    wpick(pool.filter(isHub), rng, weight);
  if (hub) {
    picked.add(hub.iata);
    batch.push(hub);
  }

  for (const continent of CONTINENTS) {
    const candidate = wpick(pool.filter((a) => a.continent === continent && !picked.has(a.iata)), rng, weight);
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
    const candidate = wpick(candidatePool, rng, weight);
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

/* ── Journeys, distance and bonuses ──────────────────────────────────── */

const EARTH_RADIUS_KM = 6371;
const KM_PER_MI = 1.609344;

/** Great-circle distance in km between two lat/lon points (haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

/** "6,461 mi / 10,398 km" — both units, rounded, for the reveal and boarding pass. */
export function fmtDistance(km: number): string {
  return `${Math.round(kmToMi(km)).toLocaleString('en-US')} mi / ${Math.round(km).toLocaleString('en-US')} km`;
}

/**
 * Whether the shorter great-circle leg between two longitudes crosses the
 * antimeridian (±180°) — the international-date-line bonus's trigger.
 */
export function crossesDateLine(lon1: number, lon2: number): boolean {
  return Math.abs(lon1 - lon2) > 180;
}

/**
 * Journey milestones — a collection, never a mission: the summary always
 * names what was achieved. Below 4 stamps there's no title, just the count.
 */
const MILESTONES: ReadonlyArray<readonly [number, string]> = [
  [10, 'World tour'],
  [8, 'Circumnavigator'],
  [6, 'Grand tour'],
  [4, 'Weekend hop'],
];

export function journeyMilestone(stamps: number): string | null {
  const hit = MILESTONES.find(([min]) => stamps >= min);
  return hit ? hit[1] : null;
}

/** The next milestone up, for the reveal strip's tease ("2 more for a Grand tour"). */
export function nextMilestone(stamps: number): { need: number; name: string } | null {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    const [min, name] = MILESTONES[i];
    if (stamps < min) return { need: min - stamps, name };
  }
  return null;
}

/** Continent bonus tiers at batch end: 4 continents +5, 5 +10, all 6 +15. */
export function continentBonus(count: number): number {
  if (count >= 6) return 15;
  if (count >= 5) return 10;
  if (count >= 4) return 5;
  return 0;
}

/**
 * The highest score a batch can bank in a mode: 10 clean answers, every
 * streak upgrade (3 per batch, doubled in FF), all six continents, the date
 * line, one long haul, and FF's elite bonus. GB 165, FF 215 under current
 * constants — derived, not hard-coded, so a bonus retune moves the gauges
 * with it.
 */
export function maxScore(mode: Mode): number {
  const upgrades = Math.floor(BATCH_SIZE / STREAK_LENGTH) * UPGRADE_BONUS * (mode === 'ff' ? 2 : 1);
  const elite = mode === 'ff' ? ELITE_BONUS : 0;
  return (
    BATCH_SIZE * ROUND_POINTS + upgrades + continentBonus(6) + DATE_LINE_BONUS + LONG_HAUL_BONUS + elite
  );
}

export interface ScoreGaugeCalibration {
  /** Top of the dial — maxScore rounded up to a clean numeral step. */
  max: number;
  /** Values that get a long tick + printed numeral. */
  majors: number[];
  minorsPerInterval: number;
}

/**
 * Per-mode dial calibration: the scale must fit the mode's true ceiling
 * (a 205-point FF batch pegged the old shared 160 dial) while keeping the
 * numerals on clean steps — 20s for GB's 160, 30s for FF's 210.
 */
export function scoreGaugeCalibration(mode: Mode): ScoreGaugeCalibration {
  const step = mode === 'ff' ? 30 : 20;
  const max = Math.ceil(maxScore(mode) / step) * step;
  const majors = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  // Minor ticks every 5 points on both dials, whatever the major step.
  return { max, majors, minorsPerInterval: step / 5 - 1 };
}

/* ── Check-in ────────────────────────────────────────────────────────── */

/** Lowercase and strip diacritics, so "Málaga" matches "malaga". */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Splits a place name into words. Compound names are the whole point: the
 * dataset carries "Raleigh/Durham", "Basel, Switzerland/Mulhouse" and
 * "Karlsruhe/Baden-Baden", so a search for one half has to reach the airport
 * named for both. Same idea as `short()` in stampTemplates.ts.
 */
function nameTokens(s: string): string[] {
  return normalize(s).split(/[/,\s–—-]+/).filter(Boolean);
}

/**
 * How well an airport answers a query, 0 (not at all) to 100. Bands rather
 * than a single rule, because the old "any prefix match outranks any
 * substring match" gave a 7-route airport an absolute veto over an 88-route
 * one: "durham" returned MME (Durham Tees Valley) instead of RDU
 * (Raleigh/Durham). Twelve airports in the dataset lost to a ≥3× smaller
 * namesake that way. Scoring by match *quality* puts both Durhams in the same
 * band, and route count then breaks the tie the way a player expects.
 *
 * City matches outrank airport-name matches: someone typing "durham" means
 * the place, not a terminal.
 */
function matchScore(a: Airport, q: string): number {
  const city = normalize(a.city_name);
  let best = 0;
  if (city === q) best = 100;
  else {
    const tokens = nameTokens(a.city_name);
    if (tokens.includes(q)) best = 80;
    else if (tokens.some((t) => t.startsWith(q))) best = 55;
    else if (city.includes(q)) best = 30;
  }
  // Only worth consulting the airport's own name if the city didn't already
  // answer better — this is what lets "Heathrow" and "Guarulhos" resolve.
  if (best < 70) {
    const name = normalize(a.name);
    const tokens = nameTokens(a.name);
    if (tokens.includes(q)) best = Math.max(best, 70);
    else if (tokens.some((t) => t.startsWith(q))) best = Math.max(best, 45);
    else if (name.includes(q)) best = Math.max(best, 20);
  }
  return best;
}

/** Airports one country may contribute before others get a look in. See searchAirports. */
const MAX_PER_COUNTRY = 3;

/**
 * Ranked airport candidates for a typed query, best first.
 *
 * Returns a list rather than one pick because 21 city names in the dataset
 * span more than one country — "london" is LHR, but also YXU (Ontario) and
 * ELS (South Africa), and only the player knows which they meant.
 *
 * Deliberately quiet on short input: under 3 characters matches nothing, and
 * exactly 3 letters is treated as an IATA code (or nothing at all), so typing
 * "Ral" on the way to "Raleigh" doesn't jump to some unrelated airport.
 */
export function searchAirports(
  all: Airport[],
  byCode: Record<string, Airport>,
  query: string,
  limit = 5,
  /**
   * The player's IANA timezone, used only to break ties between equally good
   * matches. Deliberately an exact-zone test rather than raw distance: a New
   * Yorker typing "london" means Heathrow, and proximity would wrongly hand
   * them London, Ontario (780 km) over London, UK (5,570 km). Sharing a zone
   * with YXU — being in America/Toronto — is the signal that actually means
   * "the nearby one".
   */
  timezone?: string,
): Airport[] {
  const q = normalize(query.trim());
  if (q.length < 3) return [];
  if (/^[a-z]{3}$/.test(q)) {
    const direct = byCode[q.toUpperCase()];
    return direct ? [direct] : [];
  }
  const local = (a: Airport) => (timezone && a.timezone === timezone ? 1 : 0);
  const ranked = all
    .map((airport) => ({ airport, score: matchScore(airport, q) }))
    .filter((m) => m.score > 0)
    .sort(
      (x, y) =>
        y.score - x.score ||
        local(y.airport) - local(x.airport) ||
        y.airport.routes.length - x.airport.routes.length,
    )
    .map((m) => m.airport);

  // Cap how many one country can take, so a city with several airports can't
  // hide its namesakes abroad: "london" must offer YXU (Ontario) and ELS
  // (South Africa), not five London-UK runways. Overflow is appended after,
  // so a query that only matches one country still fills the list.
  const perCountry = new Map<string, number>();
  const primary: Airport[] = [];
  const overflow: Airport[] = [];
  for (const airport of ranked) {
    const seen = perCountry.get(airport.country) ?? 0;
    perCountry.set(airport.country, seen + 1);
    (seen < MAX_PER_COUNTRY ? primary : overflow).push(airport);
  }
  return [...primary, ...overflow].slice(0, limit);
}

/**
 * searchAirports, widened by the city→airport index so towns and suburbs with
 * no airport of their own still resolve ("Chapel Hill" → RDU). Index hits are
 * appended rather than promoted: an airport actually named for the query is
 * always the better answer, and the index only fills the gap behind it.
 */
export function searchAirportsWithCities(
  all: Airport[],
  byCode: Record<string, Airport>,
  cityIndex: Record<string, string>,
  query: string,
  limit = 5,
  timezone?: string,
): Airport[] {
  const direct = searchAirports(all, byCode, query, limit, timezone);
  const q = normalize(query.trim());
  if (q.length < 4) return direct;

  const seen = new Set(direct.map((a) => a.iata));
  const out = [...direct];
  // Country-qualified keys first ("cambridge|gb"), then any country's match —
  // scanning keys is cheap next to the airport pass and keeps the index shape
  // simple.
  for (const [key, iata] of Object.entries(cityIndex)) {
    if (out.length >= limit) break;
    const city = key.slice(0, key.indexOf('|'));
    if (city !== q && !city.startsWith(q)) continue;
    const airport = byCode[iata];
    if (!airport || seen.has(iata)) continue;
    seen.add(iata);
    out.push(airport);
  }
  return out.slice(0, limit);
}

/** The single best match for a query, or null. Thin wrapper over searchAirports. */
export function resolveHomeAirport(
  all: Airport[],
  byCode: Record<string, Airport>,
  query: string,
): Airport | null {
  return searchAirports(all, byCode, query, 1)[0] ?? null;
}

export interface NearbyAirport {
  airport: Airport;
  km: number;
}

/** The closest airports to a point, nearest first — the honest "nearest airport". */
export function nearestAirports(all: Airport[], lat: number, lon: number, limit = 5): NearbyAirport[] {
  return all
    .map((airport) => ({ airport, km: haversineKm(lat, lon, airport.latitude, airport.longitude) }))
    .sort((x, y) => x.km - y.km)
    .slice(0, limit);
}

/**
 * Largest airports sharing a timezone. The last-resort seed for the check-in
 * list: `Intl` gives the browser's zone with no permission prompt and no
 * network, and every airport record carries one, so even a player who blocks
 * location and never types still sees a plausible shortlist to pick from.
 */
export function airportsInTimezone(all: Airport[], timezone: string, limit = 5): Airport[] {
  return all
    .filter((a) => a.timezone === timezone)
    .sort((x, y) => y.routes.length - x.routes.length)
    .slice(0, limit);
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

/** Index into FF_TIERS — 0 is the top tier. The single source of truth for both status and boarding group. */
function ffTierIndex(score: number): number {
  const i = FF_TIERS.findIndex(([min]) => score >= min);
  return i === -1 ? FF_TIERS.length - 1 : i;
}

/** Frequent Flyer status tier for a batch score (0-100). */
export function ffTier(score: number): string {
  return FF_TIERS[ffTierIndex(score)][1];
}

/**
 * Boarding group 1-10, derived from the Frequent Flyer tier rather than from
 * the score directly, so the two can never disagree on the same pass: a
 * Million Miler boards Group 1, Standby boards Group 10. Previously this was
 * its own decade-based formula, which after the tier recalibration could print
 * e.g. "Middle Seat" beside "GROUP 5".
 */
export function boardGroup(score: number): number {
  return ffTierIndex(score) + 1;
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

/**
 * Cockpit-gauge needle rotation for a needle drawn pointing straight up:
 * 0 sits at the bottom-left stop (−135°), full scale at bottom-right (+135°)
 * — a 270° clockwise sweep, matching the reference dials in assets/gauges/
 * (needle angle = 225° + 270°·value/max, expressed relative to 12 o'clock).
 */
export function gaugeNeedleDeg(value: number, max: number): number {
  const f = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  return -135 + 270 * f;
}
