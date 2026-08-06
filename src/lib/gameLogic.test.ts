// Distribution and composition tests for the batch/choice selection logic.
// The point of most of these is geographic variety: the original routes²
// weighting gave Africa 2.6% of the draw weight (vs 7.5% of the eligible
// pool) and let the same dozen mega-hubs recur every batch. These assertions
// are what stop that regressing.
//
// Reads the real public/airports.json rather than a fixture — the numbers
// only mean something against the actual dataset — so the bounds are ranges
// with headroom, not exact values, and survive a monthly data refresh.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Airport, Continent } from '../types';
import {
  BATCH_SIZE,
  CONTINENTS,
  HUB_FLOOR_MIN,
  MIN_BATCH_ROUTES,
  MIN_FILL_ROUTES,
  buildBatch,
  continentHubFloors,
  ffTier,
  makeChoices,
  type Rng,
} from './gameLogic';

const ALL: Airport[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'public', 'airports.json'), 'utf8'),
) as Airport[];

const GUESSABLE = ALL.filter((a) => a.routes.length >= MIN_BATCH_ROUTES);

/** Deterministic RNG so a distribution failure reproduces exactly. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A synthetic airport — only the fields the selection logic reads. */
function fake(iata: string, continent: Continent, routes: number, extra: Partial<Airport> = {}): Airport {
  return {
    iata,
    name: `${iata} Airport`,
    city_name: iata,
    country: `Country ${iata}`,
    country_code: iata.slice(0, 2),
    continent,
    latitude: 0,
    longitude: 0,
    elevation: 0,
    timezone: 'UTC',
    routes: Array.from({ length: routes }, (_, i) => ({ iata: `D${i}`, km: 100, min: 60, carriers: [] })),
    ...extra,
  };
}

describe('dataset assumptions', () => {
  it('has a guessable pool large enough for the batch logic', () => {
    expect(GUESSABLE.length).toBeGreaterThan(500);
  });

  it('gives every guessable airport a known continent', () => {
    // A null continent can never win a guaranteed per-continent slot — the
    // trim-data pipeline backfills them (see backfillContinents there).
    const orphans = GUESSABLE.filter((a) => !CONTINENTS.includes(a.continent as Continent));
    expect(orphans.map((a) => a.iata)).toEqual([]);
  });
});

describe('continentHubFloors', () => {
  it('sets each floor at the continent’s own top-20% cutoff', () => {
    // 10 airports in one continent: the top-20% cutoff sits at index 2 (the
    // 3rd largest, 300 routes), well above HUB_FLOOR_MIN.
    const pool = Array.from({ length: 10 }, (_, i) => fake(`A${i}`, 'AF', 500 - i * 100));
    expect(continentHubFloors(pool).get('AF')).toBe(300);
  });

  it('never drops a floor below HUB_FLOOR_MIN', () => {
    const pool = [fake('AAA', 'OC', 9), fake('BBB', 'OC', 8)];
    expect(continentHubFloors(pool).get('OC')).toBe(HUB_FLOOR_MIN);
  });

  it('omits continents with no airports at all', () => {
    expect(continentHubFloors([fake('AAA', 'EU', 50)]).has('AF')).toBe(false);
  });

  it('gives smaller continents a lower bar than larger ones', () => {
    const floors = continentHubFloors(GUESSABLE);
    // The whole point of relative hubs: a global ≥45 threshold left Africa
    // with 12 eligible hubs against Europe's 138.
    expect(floors.get('AF')!).toBeLessThan(floors.get('EU')!);
  });
});

describe('buildBatch composition', () => {
  it('returns BATCH_SIZE distinct, guessable airports', () => {
    const batch = buildBatch(ALL, new Set(), mulberry32(1));
    expect(batch).toHaveLength(BATCH_SIZE);
    expect(new Set(batch.map((a) => a.iata)).size).toBe(BATCH_SIZE);
    for (const a of batch) expect(a.routes.length).toBeGreaterThanOrEqual(MIN_BATCH_ROUTES);
  });

  it('orders rounds largest-first as a difficulty ramp', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const counts = buildBatch(ALL, new Set(), mulberry32(seed)).map((a) => a.routes.length);
      expect(counts).toEqual([...counts].sort((x, y) => y - x));
    }
  });

  it('opens with a hub by its own continent’s standard', () => {
    const floors = continentHubFloors(GUESSABLE);
    for (let seed = 1; seed <= 25; seed++) {
      const first = buildBatch(ALL, new Set(), mulberry32(seed))[0];
      expect(first.routes.length).toBeGreaterThanOrEqual(floors.get(first.continent as Continent)!);
    }
  });

  it('covers every continent that can fill a slot', () => {
    // 1 anchor + 6 continent slots + 3 fills: all six must be represented.
    for (let seed = 1; seed <= 25; seed++) {
      const present = new Set(buildBatch(ALL, new Set(), mulberry32(seed)).map((a) => a.continent));
      for (const continent of CONTINENTS) expect(present).toContain(continent);
    }
  });

  it('skips airports already in the used set', () => {
    const rng = mulberry32(7);
    const used = new Set<string>();
    const first = buildBatch(ALL, used, rng);
    const second = buildBatch(ALL, used, rng);
    const firstCodes = new Set(first.map((a) => a.iata));
    for (const a of second) expect(firstCodes.has(a.iata)).toBe(false);
    // buildBatch records what it hands out, so `used` grows by both batches.
    expect(used.size).toBe(BATCH_SIZE * 2);
  });

  it('recycles the pool once too little of it is left', () => {
    const pool = [
      ...CONTINENTS.flatMap((c) => Array.from({ length: 3 }, (_, i) => fake(`${c}${i}`, c, 30 + i))),
    ];
    const used = new Set(pool.map((a) => a.iata));
    // Every airport is used and the pool is far below REUSE_POOL_FLOOR, so
    // the used set must be cleared rather than returning an empty batch.
    const batch = buildBatch(pool, used, mulberry32(3));
    expect(batch.length).toBeGreaterThan(0);
  });
});

describe('buildBatch distribution', () => {
  const ROUNDS = 1000;
  const byContinent = new Map<string, number>();
  const byIata = new Map<string, number>();
  const rng = mulberry32(42);
  for (let i = 0; i < ROUNDS; i++) {
    // A fresh used-set each batch measures the weighting itself, isolated
    // from the repeat-prevention that layers on top of it in a real session.
    for (const a of buildBatch(ALL, new Set(), rng)) {
      byContinent.set(a.continent, (byContinent.get(a.continent) ?? 0) + 1);
      byIata.set(a.iata, (byIata.get(a.iata) ?? 0) + 1);
    }
  }
  const slots = ROUNDS * BATCH_SIZE;
  const share = (key: string) => (byContinent.get(key) ?? 0) / slots;

  it('gives Africa roughly one slot per batch', () => {
    // ~13.5% expected (1/6 anchor + 1 guaranteed + ~2.6% of 3 fills).
    expect(share('AF')).toBeGreaterThan(0.1);
    expect(share('AF')).toBeLessThan(0.18);
  });

  it('gives South America and Oceania a full slot each too', () => {
    expect(share('SA')).toBeGreaterThan(0.1);
    expect(share('OC')).toBeGreaterThan(0.1);
  });

  it('keeps Europe from dominating', () => {
    // Was 43% of fill weight under routes²; sqrt weighting brings it to ~21%.
    expect(share('EU')).toBeLessThan(0.26);
  });

  it('spreads Africa’s slots across many airports, not the same few', () => {
    const african = [...byIata.keys()].filter((iata) => ALL.find((a) => a.iata === iata)?.continent === 'AF');
    expect(african.length).toBeGreaterThan(60);
  });

  it('never leans on one airport', () => {
    // The mega-hub concentration cap: under routes² weighting a single
    // airport could take a double-digit share of its continent's slot.
    const [worstIata, worstCount] = [...byIata.entries()].sort((x, y) => y[1] - x[1])[0];
    expect(worstCount / slots, `${worstIata} took too many slots`).toBeLessThan(0.02);
  });
});

describe('ffTier', () => {
  it('puts everything under half marks in Standby', () => {
    // Deliberately the widest band: scores bunch high, so a decade-per-tier
    // split left almost nobody down here and crowded everyone at the top.
    for (const score of [0, 1, 25, 42, 49]) expect(ffTier(score)).toBe('Standby');
    expect(ffTier(50)).not.toBe('Standby');
  });

  it('reserves Million Miler for a near-perfect batch', () => {
    expect(ffTier(100)).toBe('Million Miler');
    expect(ffTier(98)).toBe('Million Miler');
    expect(ffTier(97)).toBe('Diamond');
  });

  it('narrows the bands as they climb', () => {
    const widths: number[] = [];
    let current = ffTier(50);
    let start = 50;
    for (let s = 51; s <= 101; s++) {
      const tier = s <= 100 ? ffTier(s) : null;
      if (tier !== current) {
        widths.push(s - start);
        current = tier as string;
        start = s;
      }
    }
    // Every band above Standby is narrower than or equal to the one below it.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i], `band ${i} vs ${i - 1}: ${widths.join(',')}`).toBeLessThanOrEqual(widths[i - 1]);
    }
    expect(widths[widths.length - 1]).toBeLessThan(widths[0]);
  });

  it('names a tier for every reachable score, in order', () => {
    const seen: string[] = [];
    for (let s = 0; s <= 100; s++) {
      const t = ffTier(s);
      expect(t, `score ${s}`).toBeTruthy();
      if (t !== seen[seen.length - 1]) seen.push(t);
    }
    expect(seen[0]).toBe('Standby');
    expect(seen[seen.length - 1]).toBe('Million Miler');
    expect(seen).toHaveLength(10); // never skips a tier
  });
});

describe('makeChoices', () => {
  const rng = mulberry32(11);

  it('returns 5 options with exactly one correct', () => {
    for (const answer of [ALL.find((a) => a.iata === 'JNB')!, ALL.find((a) => a.iata === 'NBO')!]) {
      const choices = makeChoices(ALL, answer, undefined, rng);
      expect(choices).toHaveLength(5);
      expect(choices.filter((c) => c.ok)).toHaveLength(1);
      expect(choices.find((c) => c.ok)!.airport.iata).toBe(answer.iata);
    }
  });

  it('never repeats an airport or a name among the options', () => {
    for (let i = 0; i < 50; i++) {
      const answer = GUESSABLE[Math.floor(rng() * GUESSABLE.length)];
      const choices = makeChoices(ALL, answer, undefined, rng);
      expect(new Set(choices.map((c) => c.airport.iata)).size).toBe(choices.length);
      expect(new Set(choices.map((c) => c.airport.name)).size).toBe(choices.length);
    }
  });

  it('keeps the rest of the batch out of the options', () => {
    const batch = buildBatch(ALL, new Set(), mulberry32(5));
    const batchCodes = new Set(batch.map((a) => a.iata));
    for (const answer of batch) {
      for (const c of makeChoices(ALL, answer, batchCodes, rng)) {
        // Otherwise a later round's answer shows up as an earlier round's
        // wrong option, spoiling it.
        if (!c.ok) expect(batchCodes.has(c.airport.iata)).toBe(false);
      }
    }
  });

  it('surrounds a small regional answer with same-continent peers', () => {
    // Otherwise the lone unfamiliar name in a list of world-famous hubs is
    // the answer by elimination.
    const small = GUESSABLE.filter((a) => a.routes.length < MIN_FILL_ROUTES && a.continent === 'AF');
    expect(small.length).toBeGreaterThan(10);
    let sameContinent = 0;
    let total = 0;
    for (const answer of small.slice(0, 25)) {
      for (const c of makeChoices(ALL, answer, undefined, rng)) {
        if (c.ok) continue;
        total++;
        if (c.airport.continent === answer.continent) sameContinent++;
      }
    }
    expect(sameContinent / total).toBeGreaterThan(0.6);
  });
});
