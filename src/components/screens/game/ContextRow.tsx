import { useMemo } from 'react';
import { useLocalClock } from '../../../hooks/useLocalClock';
import { useWeather } from '../../../hooks/useWeather';
import type { Airport } from '../../../types';
import { buildDestCache, departuresBucket } from '../../../lib/gameLogic';

interface Props {
  airport: Airport;
  showCountry: boolean;
}

const iconStyle = { display: 'inline-flex', alignItems: 'center', gap: 5 } as const;

export default function ContextRow({ airport, showCountry }: Props) {
  const clock = useLocalClock(airport.timezone);
  const weather = useWeather(airport);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  const destCache = useMemo(() => buildDestCache(airport), [airport.iata]);
  const depBucket = useMemo(() => departuresBucket(destCache), [destCache]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 13,
          color: 'var(--color-neutral-400)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={iconStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>Local {clock}</span>
        </span>
        {weather && (
          <span style={{ ...iconStyle, animation: 'gcChip 0.4s ease' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z" />
            </svg>
            <span>
              {weather.f}°F / {weather.c}°C
            </span>
          </span>
        )}
        {showCountry && (
          <span className="tag tag-accent" style={{ animation: 'gcChip 0.4s ease' }}>
            {airport.country}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', fontVariantNumeric: 'tabular-nums' }}>
        {depBucket} daily departures · {destCache.length} destinations
      </div>
    </div>
  );
}
