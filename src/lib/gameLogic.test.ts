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
  DATE_LINE_BONUS,
  ELITE_BONUS,
  FF_CITY_HINT_COST,
  HUB_FLOOR_MIN,
  MIN_BATCH_ROUTES,
  MIN_FILL_ROUTES,
  UPGRADE_BONUS,
  boardGroup,
  buildBatch,
  continentBonus,
  continentHubFloors,
  crossesDateLine,
  ffTier,
  fmtDistance,
  gaugeNeedleDeg,
  haversineKm,
  journeyMilestone,
  makeChoices,
  maxScore,
  nextMilestone,
  resolveHomeAirport,
  roundPoints,
  scoreGaugeCalibration,
  type Rng,
} from './gameLogic';
import { NEGATIVE_EVENTS, POSITIVE_EVENTS, rollEventLine } from './eventLines';

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

describe('destination names', () => {
  const DEST_NAMES: Record<string, string> = JSON.parse(
    readFileSync(path.join(__dirname, '..', '..', 'public', 'destination-names.json'), 'utf8'),
  ) as Record<string, string>;
  const byCode = Object.fromEntries(ALL.map((a) => [a.iata, a]));
  const cityOf = (code: string) => byCode[code]?.city_name ?? DEST_NAMES[code];

  it('can name every destination of every airport', () => {
    // The hint reads a destination's city out of the dataset, but most
    // destinations of a small regional airport are themselves too small to be
    // retained — Tarawa could name 4 of its 20 before this map existed.
    const unnameable: string[] = [];
    for (const a of ALL) {
      for (const r of a.routes) if (!cityOf(r.iata)) unnameable.push(`${a.iata}→${r.iata}`);
    }
    expect(unnameable.slice(0, 10)).toEqual([]);
  });

  it('covers the airports that were worst affected', () => {
    for (const code of ['TRW', 'ADQ', 'SUV', 'BET']) {
      const a = byCode[code];
      expect(a, `${code} missing from dataset`).toBeDefined();
      const named = a.routes.filter((r) => cityOf(r.iata)).length;
      expect(named, code).toBe(a.routes.length);
    }
  });

  it('does not duplicate what the dataset already carries', () => {
    // The map is a supplement, not a second copy — every key must be a code
    // that is NOT a retained airport.
    const dupes = Object.keys(DEST_NAMES).filter((code) => byCode[code]);
    expect(dupes).toEqual([]);
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

  it('keeps the boarding group locked to the tier', () => {
    // One source of truth: the pass shows both, so "Middle Seat · GROUP 5"
    // would be a visible contradiction.
    expect(boardGroup(100)).toBe(1); // Million Miler
    expect(boardGroup(98)).toBe(1);
    expect(boardGroup(97)).toBe(2); // Diamond
    expect(boardGroup(49)).toBe(10); // Standby
    expect(boardGroup(0)).toBe(10);

    // Group must change exactly when the tier does, and never go backwards.
    let prevTier = ffTier(0);
    let prevGroup = boardGroup(0);
    for (let s = 1; s <= 100; s++) {
      const tier = ffTier(s);
      const group = boardGroup(s);
      expect(tier === prevTier, `score ${s}: tier/group changed out of step`).toBe(group === prevGroup);
      expect(group).toBeLessThanOrEqual(prevGroup);
      prevTier = tier;
      prevGroup = group;
    }
  });

  it('spans the full range of boarding groups', () => {
    const groups = new Set(Array.from({ length: 101 }, (_, s) => boardGroup(s)));
    expect(Math.min(...groups)).toBe(1);
    expect(Math.max(...groups)).toBe(10);
    expect(groups.size).toBe(10);
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

describe('haversine distance', () => {
  const byCode = Object.fromEntries(ALL.map((a) => [a.iata, a]));

  it('matches the known YYZ→GRU great-circle distance', () => {
    // The design mock quotes "6,461 mi / 10,398 km" for this leg.
    const yyz = byCode['YYZ'];
    const gru = byCode['GRU'];
    const km = haversineKm(yyz.latitude, yyz.longitude, gru.latitude, gru.longitude);
    expect(km).toBeGreaterThan(8100);
    expect(km).toBeLessThan(8400);
  });

  it('is zero for the same point and symmetric between endpoints', () => {
    const lhr = byCode['LHR'];
    const hnd = byCode['HND'];
    expect(haversineKm(lhr.latitude, lhr.longitude, lhr.latitude, lhr.longitude)).toBe(0);
    const ab = haversineKm(lhr.latitude, lhr.longitude, hnd.latitude, hnd.longitude);
    const ba = haversineKm(hnd.latitude, hnd.longitude, lhr.latitude, lhr.longitude);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('formats both units with thousands separators', () => {
    expect(fmtDistance(10398)).toBe('6,461 mi / 10,398 km');
  });
});

describe('crossesDateLine', () => {
  it('fires only when the short leg crosses the antimeridian', () => {
    expect(crossesDateLine(170, -170)).toBe(true); // Fiji → Samoa hop
    expect(crossesDateLine(151.18, -37.01 * 0 + 174.79)).toBe(false); // SYD → AKL, same side
    expect(crossesDateLine(-0.45, 139.78)).toBe(false); // LHR → HND, over Asia
    expect(crossesDateLine(139.78, -79.63)).toBe(true); // HND → YYZ, over the Pacific
  });
});

describe('journey milestones', () => {
  it('grades by named milestone, never pass/fail', () => {
    expect(journeyMilestone(0)).toBeNull();
    expect(journeyMilestone(3)).toBeNull();
    expect(journeyMilestone(4)).toBe('Weekend hop');
    expect(journeyMilestone(5)).toBe('Weekend hop');
    expect(journeyMilestone(6)).toBe('Grand tour');
    expect(journeyMilestone(8)).toBe('Circumnavigator');
    expect(journeyMilestone(9)).toBe('Circumnavigator');
    expect(journeyMilestone(10)).toBe('World tour');
  });

  it('teases the next milestone up, and nothing past World tour', () => {
    expect(nextMilestone(0)).toEqual({ need: 4, name: 'Weekend hop' });
    expect(nextMilestone(4)).toEqual({ need: 2, name: 'Grand tour' });
    expect(nextMilestone(9)).toEqual({ need: 1, name: 'World tour' });
    expect(nextMilestone(10)).toBeNull();
  });
});

describe('bonuses', () => {
  it('tiers the continent bonus 4/5/6 → +5/+10/+15', () => {
    expect(continentBonus(0)).toBe(0);
    expect(continentBonus(3)).toBe(0);
    expect(continentBonus(4)).toBe(5);
    expect(continentBonus(5)).toBe(10);
    expect(continentBonus(6)).toBe(15);
  });

  it('computes each mode’s true ceiling', () => {
    // GB: 100 base + 3×10 streak upgrades + 15 continents + 10 date line.
    expect(maxScore('gb')).toBe(100 + 3 * UPGRADE_BONUS + continentBonus(6) + DATE_LINE_BONUS);
    expect(maxScore('gb')).toBe(155);
    // FF doubles the upgrades and adds the elite bonus — the 205 that pegged
    // the old shared 160 dial.
    expect(maxScore('ff')).toBe(100 + 6 * UPGRADE_BONUS + continentBonus(6) + DATE_LINE_BONUS + ELITE_BONUS);
    expect(maxScore('ff')).toBe(205);
  });

  it('calibrates the score dial to fit each mode’s ceiling on clean steps', () => {
    for (const mode of ['gb', 'ff'] as const) {
      const dial = scoreGaugeCalibration(mode);
      expect(dial.max).toBeGreaterThanOrEqual(maxScore(mode));
      expect(dial.max - maxScore(mode)).toBeLessThan(dial.majors[1]); // snug, not padded
      expect(dial.majors[0]).toBe(0);
      expect(dial.majors[dial.majors.length - 1]).toBe(dial.max);
      const step = dial.majors[1] - dial.majors[0];
      dial.majors.forEach((m, i) => expect(m).toBe(i * step));
      // Minor ticks land every 5 points on both dials.
      expect(step / (dial.minorsPerInterval + 1)).toBe(5);
    }
    expect(scoreGaugeCalibration('gb').max).toBe(160);
    expect(scoreGaugeCalibration('ff').max).toBe(210);
  });
});

describe('gaugeNeedleDeg', () => {
  it('sweeps 270° clockwise from the bottom-left stop', () => {
    expect(gaugeNeedleDeg(0, 160)).toBe(-135);
    expect(gaugeNeedleDeg(80, 160)).toBe(0);
    expect(gaugeNeedleDeg(160, 160)).toBe(135);
  });

  it('clamps outside the dial instead of spinning past the stops', () => {
    expect(gaugeNeedleDeg(-5, 100)).toBe(-135);
    expect(gaugeNeedleDeg(205, 160)).toBe(135); // an FF score can exceed the dial
    expect(gaugeNeedleDeg(3, 0)).toBe(-135);
  });
});

describe('resolveHomeAirport', () => {
  const byCode = Object.fromEntries(ALL.map((a) => [a.iata, a]));

  it('reads 3 letters as an IATA code, case-insensitively', () => {
    expect(resolveHomeAirport(ALL, byCode, 'RDU')?.iata).toBe('RDU');
    expect(resolveHomeAirport(ALL, byCode, 'rdu')?.iata).toBe('RDU');
  });

  it('resolves a city name to its nearest (largest, prefix-first) airport', () => {
    expect(resolveHomeAirport(ALL, byCode, 'Raleigh')?.iata).toBe('RDU');
    expect(resolveHomeAirport(ALL, byCode, 'london')?.iata).toBe('LHR');
    expect(resolveHomeAirport(ALL, byCode, 'tokyo')?.continent).toBe('AS');
  });

  it('returns null for too-short or unmatchable input', () => {
    expect(resolveHomeAirport(ALL, byCode, '')).toBeNull();
    expect(resolveHomeAirport(ALL, byCode, 'zz')).toBeNull();
    expect(resolveHomeAirport(ALL, byCode, 'qqqqxyz')).toBeNull();
    // 3 letters that aren't a code stay null rather than city-searching —
    // "Ral" shouldn't jump to some airport mid-keystroke.
    expect(resolveHomeAirport(ALL, byCode, 'XQZ')).toBeNull();
  });
});

describe('General Boarding draw', () => {
  const ROUNDS = 400;

  function avgRoutes(mode: 'gb' | 'ff', seed: number): number {
    const rng = mulberry32(seed);
    let total = 0;
    for (let i = 0; i < ROUNDS; i++) {
      for (const a of buildBatch(ALL, new Set(), rng, { mode })) total += a.routes.length;
    }
    return total / (ROUNDS * BATCH_SIZE);
  }

  it('draws noticeably larger airports than Frequent Flyer', () => {
    // Linear routes weighting vs √routes: friendlier skies = more major hubs.
    expect(avgRoutes('gb', 42)).toBeGreaterThan(avgRoutes('ff', 42) * 1.15);
  });

  it('leans toward the home continent in GB', () => {
    const share = (homeContinent?: Continent) => {
      const rng = mulberry32(7);
      let na = 0;
      for (let i = 0; i < ROUNDS; i++) {
        for (const a of buildBatch(ALL, new Set(), rng, { mode: 'gb', homeContinent })) {
          if (a.continent === 'NA') na++;
        }
      }
      return na / (ROUNDS * BATCH_SIZE);
    };
    expect(share('NA')).toBeGreaterThan(share(undefined));
  });

  it('still covers every continent in GB', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const present = new Set(
        buildBatch(ALL, new Set(), mulberry32(seed), { mode: 'gb', homeContinent: 'NA' }).map((a) => a.continent),
      );
      for (const continent of CONTINENTS) expect(present).toContain(continent);
    }
  });
});

describe('event lines', () => {
  it('supplies the promised pools of ~40 each, all distinct', () => {
    expect(POSITIVE_EVENTS).toHaveLength(40);
    expect(NEGATIVE_EVENTS).toHaveLength(40);
    expect(new Set([...POSITIVE_EVENTS, ...NEGATIVE_EVENTS]).size).toBe(80);
  });

  it('fires on ~40% of reveals — a treat, not wallpaper', () => {
    const rng = mulberry32(9);
    let fired = 0;
    for (let i = 0; i < 1000; i++) {
      if (rollEventLine('positive', new Set(), rng)) fired++;
    }
    expect(fired / 1000).toBeGreaterThan(0.33);
    expect(fired / 1000).toBeLessThan(0.47);
  });

  it('never repeats a line within a batch, and never crosses pools', () => {
    const used = new Set<string>();
    const rng: Rng = () => 0.1; // gate always fires, first index picked
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const line = rollEventLine('negative', used, rng);
      if (line) seen.push(line);
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const line of seen) expect(NEGATIVE_EVENTS).toContain(line);
    // Pool exhausted for this (absurdly long) batch: returns null, no crash.
    expect(rollEventLine('negative', used, rng)).toBeNull();
  });

  it('stays quiet when the gate does not fire', () => {
    expect(rollEventLine('positive', new Set(), () => 0.9)).toBeNull();
  });
});

describe('roundPoints (FF city-hint costs)', () => {
  it('starts at 10, drops 1 per city hint, floors at 2', () => {
    // City hints are FF's only priced reveal — clue pulls, the country
    // reveal, and name reveals are free in both modes.
    expect(roundPoints(0)).toBe(10);
    expect(roundPoints(FF_CITY_HINT_COST)).toBe(9);
    expect(roundPoints(4 * FF_CITY_HINT_COST)).toBe(6);
    expect(roundPoints(99)).toBe(2);
  });
});
