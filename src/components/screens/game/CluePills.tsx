import { useMemo, type CSSProperties } from 'react';
import type { Airport, ClueKey, HintKey } from '../../../types';
import {
  CARRIER_DISPLAY_CAP,
  DEST_DISPLAY_CAP,
  HINT_COST,
  buildCarrierList,
  buildDestCache,
} from '../../../lib/gameLogic';

interface Props {
  airport: Airport;
  byCode: Record<string, Airport>;
  clues: { car: boolean; dest: boolean };
  hints: { country: boolean; carrierNames: boolean; destNames: boolean };
  /** Small regional airports are unguessable without a geographic anchor, so their country hint is free. */
  countryHintFree: boolean;
  disabled: boolean;
  onPull: (key: ClueKey) => void;
  onUseHint: (key: HintKey) => void;
}

const pillStyle = (pulled: boolean): CSSProperties => ({
  font: 'inherit',
  fontSize: 12.5,
  cursor: 'pointer',
  color: pulled ? 'var(--color-neutral-500)' : 'var(--color-text)',
  background: 'transparent',
  border: '1px solid var(--color-divider)',
  borderRadius: 20,
  padding: '7px 14px',
  minHeight: 34,
});

// Paid reveals (cost points) get an accent-bordered pill so they read as
// distinct from the free clue pulls above.
const hintPillStyle = (done: boolean, disabled: boolean): CSSProperties => ({
  font: 'inherit',
  fontSize: 12.5,
  cursor: done || disabled ? 'not-allowed' : 'pointer',
  color: done ? 'var(--color-accent-300)' : 'var(--color-accent)',
  background: done ? 'var(--color-accent-900)' : 'transparent',
  border: `1px solid ${done ? 'var(--color-accent-800)' : 'var(--color-accent)'}`,
  borderRadius: 20,
  padding: '7px 14px',
  minHeight: 34,
});

export default function CluePills({ airport, byCode, clues, hints, countryHintFree, disabled, onPull, onUseHint }: Props) {
  // Raw data is memoized per-airport only — the carrier shuffle order must
  // stay stable for the whole round; the dest cache is cheap and
  // deterministic, so it's fine to recompute it every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  const carrierList = useMemo(() => buildCarrierList(airport), [airport.iata]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  const destCache = useMemo(() => buildDestCache(airport), [airport.iata]);
  // Pick the busiest routes *first*, then alphabetize that subset for display.
  // Truncating an alphabetical list instead would show a 150-route hub's A–F
  // slice only, hiding its most recognizable (and most non-European)
  // destinations behind "+N more".
  const visibleDests = useMemo(
    () =>
      destCache
        .slice()
        .sort((x, y) => y.n - x.n)
        .slice(0, DEST_DISPLAY_CAP)
        .sort((x, y) => (x.code < y.code ? -1 : 1)),
    [destCache],
  );

  const visibleCarriers = carrierList.slice(0, CARRIER_DISPLAY_CAP);
  const carrierMore = Math.max(0, carrierList.length - CARRIER_DISPLAY_CAP);
  const destMore = Math.max(0, destCache.length - DEST_DISPLAY_CAP);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => onPull('car')} style={pillStyle(clues.car)}>
          Airlines
        </button>
        <button onClick={() => onPull('dest')} style={pillStyle(clues.dest)}>
          Destinations
        </button>
        <button
          onClick={() => onUseHint('country')}
          disabled={hints.country || disabled}
          style={hintPillStyle(hints.country, disabled)}
        >
          {hints.country ? 'Country ✓' : countryHintFree ? 'Reveal country — free' : `Reveal country −${HINT_COST} pts`}
        </button>
      </div>

      {clues.car && (
        <div style={{ animation: 'gcChip 0.35s ease', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {visibleCarriers.map((c) => (
            <span key={c.code} className="tag tag-neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
              {hints.carrierNames ? `${c.code} ${c.name}` : c.code}
            </span>
          ))}
          {carrierMore > 0 && <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>+{carrierMore} more</span>}
          {!hints.carrierNames && (
            <button
              onClick={() => onUseHint('carrierNames')}
              disabled={disabled}
              style={{ ...hintPillStyle(false, disabled), fontSize: 11, padding: '5px 11px', minHeight: 28 }}
            >
              Airline names −{HINT_COST} pts
            </button>
          )}
        </div>
      )}

      {clues.dest && (
        <div style={{ animation: 'gcChip 0.35s ease', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {visibleDests.map((d) => {
            const dest = byCode[d.code];
            return (
              <span key={d.code} className="tag tag-accent-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                {hints.destNames && dest ? `${d.code} ${dest.city_name}` : d.code}
              </span>
            );
          })}
          {destMore > 0 && <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>+{destMore} more</span>}
          {!hints.destNames && (
            <button
              onClick={() => onUseHint('destNames')}
              disabled={disabled}
              style={{ ...hintPillStyle(false, disabled), fontSize: 11, padding: '5px 11px', minHeight: 28 }}
            >
              Destination names −{HINT_COST} pts
            </button>
          )}
        </div>
      )}
    </div>
  );
}
