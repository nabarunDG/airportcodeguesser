import { useMemo, type CSSProperties } from 'react';
import type { Airport, ClueKey } from '../../../types';
import {
  CARRIER_DISPLAY_CAP,
  DEST_DISPLAY_CAP,
  buildCarrierList,
  buildDestCache,
  departuresBucket,
} from '../../../lib/gameLogic';

interface Props {
  airport: Airport;
  clues: { dep: boolean; car: boolean; dest: boolean };
  hints: { sorted: boolean; names: boolean };
  onPull: (key: ClueKey) => void;
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

export default function CluePills({ airport, clues, hints, onPull }: Props) {
  // Raw data is memoized per-airport only — the carrier shuffle order must
  // stay stable for the whole round even as the `names` hint toggles label
  // format; the dest cache's sort order (by hints.sorted) is cheap and
  // deterministic, so it's fine to recompute that part every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  const carrierList = useMemo(() => buildCarrierList(airport), [airport.iata]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  const destCache = useMemo(() => buildDestCache(airport), [airport.iata]);

  const destSorted = useMemo(
    () => (hints.sorted ? destCache.slice().sort((x, y) => y.n - x.n) : destCache.slice().sort((x, y) => (x.code < y.code ? -1 : 1))),
    [destCache, hints.sorted],
  );

  const depBucket = useMemo(() => departuresBucket(destCache), [destCache]);

  const visibleCarriers = carrierList.slice(0, CARRIER_DISPLAY_CAP);
  const carrierMore = Math.max(0, carrierList.length - CARRIER_DISPLAY_CAP);
  const visibleDests = destSorted.slice(0, DEST_DISPLAY_CAP);
  const destMore = Math.max(0, destSorted.length - DEST_DISPLAY_CAP);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: 'var(--color-neutral-600)', alignSelf: 'center' }}>
          free clues
          <br />
        </span>
        <button onClick={() => onPull('dep')} style={pillStyle(clues.dep)}>
          Departures
        </button>
        <button onClick={() => onPull('car')} style={pillStyle(clues.car)}>
          Airlines
        </button>
        <button onClick={() => onPull('dest')} style={pillStyle(clues.dest)}>
          Destinations
        </button>
      </div>

      {clues.dep && (
        <div style={{ animation: 'gcChip 0.35s ease', fontSize: 13, color: 'var(--color-neutral-300)', padding: '2px 2px 0' }}>
          Est. <strong style={{ color: 'var(--color-text)' }}>{depBucket}</strong> daily departures · serves{' '}
          <strong style={{ color: 'var(--color-text)' }}>{destCache.length}</strong> nonstop destinations
        </div>
      )}

      {clues.car && (
        <div style={{ animation: 'gcChip 0.35s ease', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {visibleCarriers.map((c) => (
            <span key={c.code} className="tag tag-neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
              {hints.names ? `${c.code} ${c.name}` : c.code}
            </span>
          ))}
          {carrierMore > 0 && <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>+{carrierMore} more</span>}
        </div>
      )}

      {clues.dest && (
        <div style={{ animation: 'gcChip 0.35s ease', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {visibleDests.map((d) => (
            <span key={d.code} className="tag tag-accent-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
              {hints.sorted ? `${d.code} ×${d.n}` : d.code}
            </span>
          ))}
          {destMore > 0 && <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>+{destMore} more</span>}
        </div>
      )}
    </div>
  );
}
