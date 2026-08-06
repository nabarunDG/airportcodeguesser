// Passport-stamp dies. Six templates — one per continent — each a shape, an
// ink pair, a typeface and some ornament, with slots filled from an airport
// record. A filled passport page therefore maps where a batch went.
//
// Pure string-building, no React, so it unit-tests directly like gameLogic.ts.
// The SVG comes back as markup rather than JSX because these dies are mostly
// generated geometry (scalloped edges, bead rings, arc text) that reads far
// better as one template literal than as forty nested elements; PassportStamp
// injects it inside a React-owned <svg>. Every interpolated value from the
// dataset goes through esc() first — 25 records carry apostrophes, and country
// names run to 37 characters.
//
// Deliberately NOT modelled on the real thing in one respect: real stamps
// centre the date. Gate Check centres the IATA code, because that's what the
// player just decoded.
import type { Airport, Continent, StampSlots } from '../types';

export type StampFontKey = 'condensed' | 'heavy' | 'typewriter' | 'serif' | 'wide' | 'mono';

export interface StampTemplate {
  id: string;
  label: string;
  continent: Continent;
  /** True ink for paper; a lifted version of the same hue for the dark boarding pass. */
  ink: { paper: string; dark: string };
  font: StampFontKey;
  ornaments: string;
  /** Which whimsy line this die carries, if any. Only the wide dies have room. */
  extra: 'coords' | 'elev' | null;
  viewBox: string;
  width: number;
  note: string;
  draw: (s: StampSlots, ids: DieIds) => string;
}

/** Per-instance SVG ids. Shared ids across instances would cross-wire textPaths and filters. */
export interface DieIds {
  arcTop: string;
  arcBottom: string;
  perimeter: string;
}

// Six families that genuinely differ and are already on every machine — the
// app blocks font CDNs, and six webfonts would dwarf the JS bundle. Tracking
// from 0.5 to 3 pushes them further apart than the families alone do.
export const STAMP_FONTS: Record<StampFontKey, string> = {
  condensed: "'Arial Narrow','Helvetica Neue',Arial,sans-serif",
  heavy: "Impact,Haettenschweiler,'Arial Narrow',sans-serif",
  typewriter: "'Courier New',Courier,monospace",
  serif: "Georgia,'Times New Roman',serif",
  wide: "system-ui,-apple-system,'Segoe UI',sans-serif",
  mono: "ui-monospace,'SF Mono',Menlo,monospace",
};

/** FNV-ish string hash. Drives per-airport tilt and wear so both are stable across devices. */
export function stampHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Resting angle, −7…+7°, fixed per airport so a page never looks tiled. */
export function stampTilt(code: string): number {
  return (stampHash(code) % 15) - 7;
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Trims a display string to something a die can actually print. Compound
 * names ("Bristol, VA/Johnson City/Kingsport") keep only their first segment;
 * anything still over `max` is hard-trimmed rather than compressed into
 * illegibility by textLength.
 */
function short(v: string, max: number): string {
  const first = v.split(/[/,]/)[0].trim() || v;
  return first.length > max ? first.slice(0, max).trim() : first;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 'YYYY-MM-DD' (see todayUTC) → 'AUG 2026'. */
export function stampDate(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return `${MONTHS[Math.min(11, Math.max(0, (m || 1) - 1))]} ${y}`;
}

function coordStr(lat: number, lon: number): string {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'}`;
  const ew = `${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`;
  return `${ns}  ${ew}`;
}

/**
 * Builds the printable slots for one airport.
 * NB: the dataset's `elevation` is in FEET (La Paz 13,313; Amsterdam −11).
 */
export function stampSlots(airport: Airport, isoDate: string): StampSlots {
  return {
    code: airport.iata,
    city: short(airport.city_name, 22),
    country: short(airport.country, 26),
    date: stampDate(isoDate),
    coords: coordStr(airport.latitude, airport.longitude),
    elev: `${airport.elevation.toLocaleString('en-US')} FT`,
  };
}

/* ── Ornament vocabulary ─────────────────────────────────────────────── */

function beadRing(cx: number, cy: number, r: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out += `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="1.1" fill="currentColor"/>`;
  }
  return out;
}

function star(cx: number, cy: number, r: number): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${p.join('L')}Z" fill="currentColor"/>`;
}

function starRow(cx: number, y: number, n: number, r: number, gap: number): string {
  let out = '';
  const start = cx - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) out += star(start + i * gap, y, r);
  return out;
}

function dottedRule(x1: number, x2: number, y: number): string {
  return `<line class="gc-die" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="1.2" stroke-dasharray="1.4 2.2"/>`;
}

/** Wavy seal edge, generated rather than hand-authored as path data. */
function scallop(cx: number, cy: number, r: number, lobes: number): string {
  const pts: string[] = [];
  const steps = lobes * 20;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r - 3.2 + 3.2 * Math.cos(t * lobes);
    pts.push(`${(cx + rr * Math.cos(t)).toFixed(2)},${(cy + rr * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function shield(cx: number, top: number, w: number, h: number): string {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const sh = top + h * 0.6;
  return (
    `M${l},${top + 7}Q${l},${top} ${l + 7},${top}` +
    `H${r - 7}Q${r},${top} ${r},${top + 7}` +
    `V${sh}Q${r},${top + h} ${cx},${top + h}` +
    `Q${l},${top + h} ${l},${sh}Z`
  );
}

const PLANE =
  '<path d="M21 16v-2l-8-2.5V6a1.5 1.5 0 0 0-3 0v5.5L2 14v2l8-1.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-4.5z" fill="currentColor"/>';

type Anchor = 'start' | 'middle' | 'end';

/**
 * A text run force-fitted into `max` units. Long values track tighter via
 * textLength instead of spilling past the die's border.
 */
function fit(
  txt: string,
  x: number,
  y: number,
  max: number,
  size: number,
  sp: number,
  font: string,
  anchor: Anchor = 'middle',
  slot?: string,
): string {
  const est = txt.length * size * 0.56 + txt.length * sp;
  const tl = est > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  const attr = slot ? ` data-slot="${slot}"` : '';
  return (
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" letter-spacing="${sp}"` +
    ` font-family="${font}"${attr}${tl}>${esc(txt)}</text>`
  );
}

function arcText(pathId: string, txt: string, size: number, sp: number, font: string, slot: string): string {
  return (
    `<text font-size="${size}" letter-spacing="${sp}" font-family="${font}" data-slot="${slot}">` +
    `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${esc(txt.toUpperCase())}</textPath></text>`
  );
}

/* ── The six dies ────────────────────────────────────────────────────── */

const F = STAMP_FONTS;

export const STAMP_TEMPLATES: StampTemplate[] = [
  {
    id: 'crossing',
    label: 'Crossing',
    continent: 'EU',
    ink: { paper: '#2f5fa8', dark: '#93b7ef' },
    font: 'condensed',
    ornaments: 'bead ring · tramlines',
    extra: null,
    viewBox: '0 0 124 124',
    width: 116,
    note: 'Country on the top arc, city on the bottom, code boxed in tramlines.',
    draw: (s, ids) =>
      '<circle class="gc-die" cx="62" cy="62" r="57" stroke-width="2.4"/>' +
      '<circle class="gc-die" cx="62" cy="62" r="49" stroke-width="0.9"/>' +
      beadRing(62, 62, 53, 40) +
      `<path id="${ids.arcTop}" d="M62,62 m-39,0 a39,39 0 0,1 78,0" fill="none"/>` +
      `<path id="${ids.arcBottom}" d="M62,62 m37,0 a37,37 0 0,1 -74,0" fill="none"/>` +
      arcText(ids.arcTop, s.country, 9.5, 2.2, F.condensed, 'country') +
      arcText(ids.arcBottom, s.city, 8, 1.5, F.condensed, 'city') +
      '<line class="gc-die" x1="24" y1="48" x2="100" y2="48" stroke-width="1"/>' +
      '<line class="gc-die" x1="24" y1="76" x2="100" y2="76" stroke-width="1"/>' +
      fit(s.code, 62, 68, 60, 25, 3, F.mono, 'middle', 'code') +
      fit(s.date, 62, 85, 52, 7.5, 1.2, F.condensed, 'middle', 'date'),
  },
  {
    id: 'banner',
    label: 'Banner',
    continent: 'AS',
    ink: { paper: '#23242b', dark: '#bcbfcd' },
    font: 'heavy',
    ornaments: 'chevron ends · solid rules',
    extra: 'elev',
    viewBox: '0 0 176 96',
    width: 166,
    note: 'Elongated hexagon with pennant ends; carries the field elevation.',
    draw: (s) =>
      '<path class="gc-die" d="M4,48 L26,14 H150 L172,48 L150,82 H26 Z" stroke-width="2.6"/>' +
      '<path class="gc-die" d="M12,48 L31,20 H145 L164,48 L145,76 H31 Z" stroke-width="0.9"/>' +
      '<path d="M26,20 L40,20 L26,34 Z M150,20 L136,20 L150,34 Z M26,76 L40,76 L26,62 Z M150,76 L136,76 L150,62 Z" fill="currentColor" opacity="0.9"/>' +
      fit(s.country.toUpperCase(), 88, 32, 92, 9.5, 1.2, F.heavy, 'middle', 'country') +
      fit(s.code, 88, 60, 80, 30, 2, F.mono, 'middle', 'code') +
      fit(s.city.toUpperCase(), 88, 72, 84, 7.5, 1.1, F.condensed, 'middle', 'city') +
      fit(s.date, 40, 50, 30, 6.5, 0.7, F.condensed, 'middle', 'date') +
      fit(s.elev, 136, 50, 30, 6.5, 0.7, F.condensed, 'middle', 'extra'),
  },
  {
    id: 'admitted',
    label: 'Admitted',
    continent: 'NA',
    ink: { paper: '#bf3b2e', dark: '#f0a099' },
    font: 'typewriter',
    ornaments: 'serial micro-border · star row',
    extra: 'coords',
    viewBox: '0 0 176 96',
    width: 166,
    note: 'Double box with the serial repeated as micro-text around the border.',
    draw: (s, ids) => {
      const serial = (stampHash(s.code) % 900) + 100;
      const micro = ` ${serial}`.repeat(26);
      return (
        `<path id="${ids.perimeter}" d="M9,9 H167 V87 H9 Z" fill="none"/>` +
        '<rect class="gc-die" x="4" y="4" width="168" height="88" rx="2" stroke-width="2.4"/>' +
        '<rect class="gc-die" x="15" y="15" width="146" height="66" rx="1" stroke-width="0.9"/>' +
        `<text font-size="4.6" letter-spacing="0.4" font-family="${F.mono}" opacity="0.85">` +
        `<textPath href="#${ids.perimeter}" startOffset="0">${micro}</textPath></text>` +
        starRow(64, 25, 3, 1.9, 8) +
        fit('ADMITTED', 106, 27, 52, 7.5, 2.4, F.typewriter) +
        fit(s.code, 88, 55, 96, 27, 3, F.mono, 'middle', 'code') +
        dottedRule(24, 152, 62) +
        fit(s.city.toUpperCase(), 24, 72, 66, 7.5, 0.9, F.typewriter, 'start', 'city') +
        fit(s.date, 152, 72, 42, 7.5, 0.8, F.typewriter, 'end', 'date') +
        fit(s.coords, 88, 82, 108, 6, 0.6, F.mono, 'middle', 'extra')
      );
    },
  },
  {
    id: 'seal',
    label: 'Seal',
    continent: 'AF',
    ink: { paper: '#16785f', dark: '#6fd0b0' },
    font: 'serif',
    ornaments: 'scalloped edge · star cluster',
    extra: null,
    viewBox: '0 0 124 124',
    width: 116,
    note: 'Twenty-lobe wavy edge — unmistakable even at chip size.',
    draw: (s) =>
      `<path class="gc-die" d="${scallop(62, 62, 58, 20)}" stroke-width="1.7"/>` +
      '<circle class="gc-die" cx="62" cy="62" r="45" stroke-width="2"/>' +
      fit(s.city.toUpperCase(), 62, 44, 60, 8, 1.5, F.serif, 'middle', 'city') +
      '<line class="gc-die" x1="34" y1="49" x2="90" y2="49" stroke-width="0.8"/>' +
      fit(s.code, 62, 72, 58, 24, 2, F.mono, 'middle', 'code') +
      dottedRule(36, 88, 78) +
      fit(s.country.toUpperCase(), 62, 87, 58, 7, 1.3, F.serif, 'middle', 'country') +
      fit(s.date, 62, 96, 46, 6.5, 1, F.serif, 'middle', 'date') +
      starRow(62, 35, 2, 1.9, 11),
  },
  {
    id: 'consular',
    label: 'Consular',
    continent: 'SA',
    ink: { paper: '#7a4bab', dark: '#c6a6e8' },
    font: 'wide',
    ornaments: 'aircraft glyph · double rule',
    extra: null,
    viewBox: '0 0 124 124',
    width: 116,
    note: 'Shield with the mode-of-entry glyph; the tallest centre field of the six.',
    draw: (s) =>
      `<path class="gc-die" d="${shield(62, 8, 100, 108)}" stroke-width="2.5"/>` +
      `<path class="gc-die" d="${shield(62, 14, 88, 96)}" stroke-width="0.9"/>` +
      fit(s.country.toUpperCase(), 62, 32, 68, 8.5, 1.6, F.wide, 'middle', 'country') +
      `<g transform="translate(54 36) scale(0.62)">${PLANE}</g>` +
      fit(s.code, 62, 76, 52, 21, 2.4, F.mono, 'middle', 'code') +
      '<line class="gc-die" x1="30" y1="83" x2="94" y2="83" stroke-width="1.4"/>' +
      '<line class="gc-die" x1="30" y1="86" x2="94" y2="86" stroke-width="0.6"/>' +
      fit(s.date, 62, 98, 66, 10, 1, F.wide, 'middle', 'date') +
      fit(s.city.toUpperCase(), 62, 108, 62, 6.5, 1.2, F.wide, 'middle', 'city'),
  },
  {
    id: 'transit',
    label: 'Transit',
    continent: 'OC',
    ink: { paper: '#16788f', dark: '#7ed0e4' },
    font: 'mono',
    ornaments: 'dotted inner ring · side serials',
    extra: 'coords',
    viewBox: '0 0 176 96',
    width: 166,
    note: 'Oval with ring text and vertical side serials; carries the coordinates.',
    draw: (s, ids) => {
      const serial = (stampHash(s.code) % 90000) + 10000;
      return (
        '<ellipse class="gc-die" cx="88" cy="48" rx="84" ry="42" stroke-width="2.5"/>' +
        '<ellipse class="gc-die" cx="88" cy="48" rx="76" ry="35" stroke-width="0.9" stroke-dasharray="1.5 2.4"/>' +
        `<path id="${ids.arcTop}" d="M88,48 m-64,0 a64,32 0 0,1 128,0" fill="none"/>` +
        `<path id="${ids.arcBottom}" d="M88,48 m62,0 a62,31 0 0,1 -124,0" fill="none"/>` +
        arcText(ids.arcTop, s.country, 8, 1.9, F.mono, 'country') +
        arcText(ids.arcBottom, s.city, 6.5, 1.3, F.mono, 'city') +
        '<rect class="gc-die" x="44" y="30" width="88" height="28" rx="1.5" stroke-width="1"/>' +
        fit(s.code, 88, 52, 80, 25, 2.4, F.mono, 'middle', 'code') +
        fit(s.coords, 88, 67, 88, 6, 0.5, F.mono, 'middle', 'extra') +
        fit(s.date, 88, 76, 52, 6.5, 0.8, F.mono, 'middle', 'date') +
        `<text transform="translate(20 48) rotate(-90)" text-anchor="middle" font-size="6.5" letter-spacing="1.2" font-family="${F.mono}">${serial}</text>` +
        `<text transform="translate(156 48) rotate(90)" text-anchor="middle" font-size="6.5" letter-spacing="1.2" font-family="${F.mono}">${serial}</text>`
      );
    },
  },
];

const BY_CONTINENT = new Map<Continent, StampTemplate>(STAMP_TEMPLATES.map((t) => [t.continent, t]));

/**
 * The die for an airport's continent. Falls back to Crossing — the trim-data
 * pipeline backfills missing continents (see backfillContinents there), so
 * this only guards against a future data regression.
 */
export function templateFor(continent: Continent | string): StampTemplate {
  return BY_CONTINENT.get(continent as Continent) ?? STAMP_TEMPLATES[0];
}

/**
 * Worn-rubber defs for one die: turbulence nudges the edges off true and a
 * soft mottled mask thins the ink in patches. Kept light on purpose — enough
 * to read as a rubber die rather than vector art, well short of damaged.
 * Seeded from the IATA code so an airport always wears identically.
 */
export function wearDefs(filterId: string, maskId: string, code: string): string {
  const seed = stampHash(code) % 100;
  return (
    `<filter id="${filterId}" x="-12%" y="-12%" width="124%" height="124%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="${seed}" result="n"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="0.7" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    `<filter id="${filterId}-m">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="3" seed="${(seed + 7) % 100}"/>` +
    // Alpha = MASK_SLOPE·R + MASK_FLOOR. fractalNoise centres R near 0.5, so
    // this clamps to fully opaque across most of the die and only dips where
    // the noise runs dark — light patchy wear.
    //
    // Getting this wrong is not subtle: an earlier slope/floor of 1.15/−0.04
    // resolved to ~0.5 alpha *everywhere*, silently rendering every stamp at
    // half opacity. On cream paper that passed for worn ink; on the dark
    // boarding pass it made the near-black die almost invisible.
    `<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${MASK_SLOPE} 0 0 0 ${MASK_FLOOR}"/>` +
    '</filter>' +
    `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="220" height="160">` +
    `<rect x="-10" y="-10" width="220" height="160" fill="white" filter="url(#${filterId}-m)"/>` +
    '</mask>'
  );
}

const MASK_SLOPE = 1.4;
/** Worst-case alpha anywhere on a die. Keeps the faintest patch legible. */
export const MASK_FLOOR = 0.55;
