// Tests for the passport-stamp dies. The load-bearing claims are that every
// continent maps to a die, that every one of the 2,147 real airports can be
// printed by its die without producing broken markup, and that a stamp's
// appearance is stable per airport (tilt and wear are hashed from the code).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Airport, Continent } from '../types';
import { CONTINENTS, makeFact } from './gameLogic';
import {
  MASK_FLOOR,
  STAMP_TEMPLATES,
  stampDate,
  stampHash,
  stampSlots,
  stampTilt,
  templateFor,
  wearDefs,
} from './stampTemplates';

const ALL: Airport[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'public', 'airports.json'), 'utf8'),
) as Airport[];

const IDS = { arcTop: 'at', arcBottom: 'ab', perimeter: 'p' };
const DATE = '2026-08-06';

describe('template coverage', () => {
  it('gives every continent its own die', () => {
    const covered = STAMP_TEMPLATES.map((t) => t.continent).sort();
    expect(covered).toEqual([...CONTINENTS].sort());
  });

  it('maps each continent to a distinct die', () => {
    expect(new Set(STAMP_TEMPLATES.map((t) => t.id)).size).toBe(STAMP_TEMPLATES.length);
    for (const c of CONTINENTS) expect(templateFor(c).continent).toBe(c);
  });

  it('falls back rather than throwing on an unknown continent', () => {
    // trim-data backfills missing continents; this only guards a data regression.
    expect(templateFor('' as Continent).id).toBe(STAMP_TEMPLATES[0].id);
  });

  it('puts the whimsy line on exactly three of the six', () => {
    // All six carrying coordinates would just be noise.
    expect(STAMP_TEMPLATES.filter((t) => t.extra !== null)).toHaveLength(3);
  });

  it('gives each die its own typeface and ink', () => {
    expect(new Set(STAMP_TEMPLATES.map((t) => t.font)).size).toBe(STAMP_TEMPLATES.length);
    expect(new Set(STAMP_TEMPLATES.map((t) => t.ink.paper)).size).toBe(STAMP_TEMPLATES.length);
    expect(new Set(STAMP_TEMPLATES.map((t) => t.ink.dark)).size).toBe(STAMP_TEMPLATES.length);
  });
});

describe('stampSlots', () => {
  it('reduces a compound city name to its first segment', () => {
    const messy = ALL.find((a) => a.city_name.includes('/'))!;
    expect(messy.city_name).toContain('/');
    expect(stampSlots(messy, DATE).city).not.toContain('/');
  });

  it('keeps every printed value short enough for a die', () => {
    for (const a of ALL) {
      const s = stampSlots(a, DATE);
      expect(s.city.length).toBeLessThanOrEqual(22);
      expect(s.country.length).toBeLessThanOrEqual(26);
    }
  });

  it('formats coordinates with hemispheres', () => {
    const gru = ALL.find((a) => a.iata === 'GRU')!; // southern + western
    expect(stampSlots(gru, DATE).coords).toMatch(/^\d+\.\d°S {2}\d+\.\d°W$/);
    const hnd = ALL.find((a) => a.iata === 'HND')!; // northern + eastern
    expect(stampSlots(hnd, DATE).coords).toMatch(/^\d+\.\d°N {2}\d+\.\d°E$/);
  });

  it('labels elevation in feet, which is the dataset’s actual unit', () => {
    // La Paz is 13,313 ft / 4,058 m — mislabelling this as metres was a
    // real shipped bug, see makeFact.
    const lpb = ALL.find((a) => a.iata === 'LPB')!;
    expect(stampSlots(lpb, DATE).elev).toBe('13,313 FT');
  });

  it('renders the month and year, not a full date', () => {
    expect(stampDate('2026-08-06')).toBe('AUG 2026');
    expect(stampDate('2026-01-31')).toBe('JAN 2026');
    expect(stampDate('2026-12-01')).toBe('DEC 2026');
  });
});

describe('die output', () => {
  it('prints every real airport without unbalanced or empty markup', () => {
    for (const a of ALL) {
      const die = templateFor(a.continent);
      const svg = die.draw(stampSlots(a, DATE), IDS);
      expect(svg.length).toBeGreaterThan(100);
      // A stray unescaped '<' or a dropped '>' would break the whole page.
      const opens = (svg.match(/</g) ?? []).length;
      const closes = (svg.match(/>/g) ?? []).length;
      expect(opens, `${a.iata} tag count`).toBe(closes);
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('NaN');
    }
  });

  it('escapes apostrophes and ampersands out of the dataset', () => {
    // 25 records carry apostrophes, e.g. Cote d'Ivoire.
    const abj = ALL.find((a) => a.iata === 'ABJ')!;
    expect(abj.country).toContain("'");
    const svg = templateFor(abj.continent).draw(stampSlots(abj, DATE), IDS);
    expect(svg).not.toContain('&&');
    const synthetic = { ...stampSlots(abj, DATE), city: 'A & B <script>' };
    const hostile = templateFor(abj.continent).draw(synthetic, IDS);
    expect(hostile).toContain('&amp;');
    expect(hostile).not.toContain('<script>');
  });

  it('always prints the code as the largest element', () => {
    // The code is the hero — it's what the player just decoded.
    for (const die of STAMP_TEMPLATES) {
      const svg = die.draw(stampSlots(ALL.find((a) => a.iata === 'NBO')!, DATE), IDS);
      const sizes = [...svg.matchAll(/font-size="([\d.]+)"[^>]*data-slot="(\w+)"/g)].map((m) => ({
        size: Number(m[1]),
        slot: m[2],
      }));
      const code = sizes.find((s) => s.slot === 'code');
      expect(code, `${die.id} has no code slot`).toBeDefined();
      const biggest = Math.max(...sizes.map((s) => s.size));
      expect(code!.size, `${die.id}`).toBe(biggest);
    }
  });

  it('compresses a long country name instead of overflowing the die', () => {
    const long = ALL.find((a) => a.country === "Democratic People's Republic of Korea")!;
    const svg = templateFor(long.continent).draw(stampSlots(long, DATE), IDS);
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it('only carries coords/elevation on the dies that declare them', () => {
    const nbo = ALL.find((a) => a.iata === 'NBO')!;
    const slots = stampSlots(nbo, DATE);
    for (const die of STAMP_TEMPLATES) {
      const svg = die.draw(slots, IDS);
      const hasExtra = svg.includes('data-slot="extra"');
      expect(hasExtra, `${die.id}`).toBe(die.extra !== null);
    }
  });
});

describe('stability per airport', () => {
  it('hashes the same code to the same tilt every time', () => {
    expect(stampTilt('NBO')).toBe(stampTilt('NBO'));
    expect(stampTilt('NBO')).toBeGreaterThanOrEqual(-7);
    expect(stampTilt('NBO')).toBeLessThanOrEqual(7);
  });

  it('spreads tilt across the range rather than clustering', () => {
    const seen = new Set(ALL.map((a) => stampTilt(a.iata)));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('seeds wear from the code, so a stamp always wears the same way', () => {
    const a = wearDefs('f', 'm', 'NBO');
    expect(a).toBe(wearDefs('f', 'm', 'NBO'));
    expect(a).not.toBe(wearDefs('f', 'm', 'JNB'));
  });

  it('keeps wear light — displacement well under 1px', () => {
    // The first pass used 1.5 and looked damaged rather than rubber-stamped.
    const scale = Number(/scale="([\d.]+)"/.exec(wearDefs('f', 'm', 'NBO'))![1]);
    expect(scale).toBeLessThanOrEqual(0.8);
  });

  it('leaves the die mostly opaque across the whole noise range', () => {
    // Regression guard. The mask's alpha is slope·R + floor over fractalNoise,
    // whose R centres near 0.5. An earlier 1.15/−0.04 resolved to ~0.5 alpha
    // everywhere, so every stamp rendered at half opacity and the near-black
    // die all but vanished on the dark boarding pass.
    const [, slope, floor] = /([\d.]+) 0 0 0 (-?[\d.]+)"\/><\/filter>/.exec(wearDefs('f', 'm', 'NBO'))!;
    const alphaAt = (r: number) => Math.min(1, Math.max(0, Number(slope) * r + Number(floor)));
    expect(alphaAt(0.5), 'mid-range noise must be fully opaque').toBe(1);
    expect(alphaAt(0.35), 'only clearly dark noise should thin the ink').toBe(1);
    expect(alphaAt(0), 'the very faintest patch must stay legible').toBeGreaterThanOrEqual(MASK_FLOOR);
  });

  it('never emits a turbulence seed outside SVG’s sane range', () => {
    for (const a of ALL) {
      for (const seed of [...wearDefs('f', 'm', a.iata).matchAll(/seed="(\d+)"/g)].map((m) => Number(m[1]))) {
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(100);
      }
    }
  });

  it('hashes without collapsing everything to one bucket', () => {
    expect(stampHash('AAA')).not.toBe(stampHash('AAB'));
  });
});

describe('makeFact elevation units', () => {
  const byCode: Record<string, Airport> = Object.fromEntries(ALL.map((a) => [a.iata, a]));

  it('never claims an airport is thousands of metres up when it is feet', () => {
    // The shipped bug: Denver (5,389 ft) read "At 5,389 m elevation".
    const den = byCode['DEN'];
    for (let i = 0; i < 60; i++) {
      const fact = makeFact(den, byCode);
      expect(fact).not.toContain('5,389 m');
    }
  });

  it('quotes both units when it mentions elevation at all', () => {
    const lpb = byCode['LPB'];
    const facts = new Set(Array.from({ length: 200 }, () => makeFact(lpb, byCode)));
    const elevation = [...facts].find((f) => f.includes('elevation'));
    expect(elevation).toBeDefined();
    expect(elevation).toContain('13,313 ft');
    expect(elevation).toContain('4,058 m');
  });

  it('reserves the fact for genuinely high airports', () => {
    // 1,500 ft fired for 406 of 2,147 airports, most of them unremarkable;
    // 1,500 m (~4,921 ft) is the height actually worth remarking on.
    const qualifying = ALL.filter((a) => a.elevation > 4900).length;
    expect(qualifying).toBeLessThan(120);
    const tlv = byCode['TLV']; // 135 ft — must never qualify
    const facts = new Set(Array.from({ length: 80 }, () => makeFact(tlv, byCode)));
    expect([...facts].some((f) => f.includes('elevation'))).toBe(false);
  });
});
