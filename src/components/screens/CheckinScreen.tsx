import { useMemo, useState } from 'react';
import type { Airport } from '../../types';
import { resolveHomeAirport } from '../../lib/gameLogic';

interface Props {
  airports: Airport[];
  byCode: Record<string, Airport>;
  /** A previously checked-in airport, to prefill on later sessions. */
  homeAirport: string | null;
  onCheckIn: (iata: string) => void;
}

const PLANE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 16v-2l-8-2.5V6a1.5 1.5 0 0 0-3 0v5.5L2 14v2l8-1.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-4.5z" />
  </svg>
);

/**
 * Check-in (required before round 1): one combined input — 3 letters read as
 * an IATA code, 4+ as a city search resolving to the nearest airport. The
 * result anchors the GB draw bias, the distance-flown metric, and the
 * automatic score post (no more post-score form on the summary).
 */
export default function CheckinScreen({ airports, byCode, homeAirport, onCheckIn }: Props) {
  const [input, setInput] = useState(homeAirport ?? '');
  const resolved = useMemo(() => resolveHomeAirport(airports, byCode, input), [airports, byCode, input]);
  const showNoMatch = input.trim().length >= 4 && !resolved;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 18,
        padding: '12px 28px 48px',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 620,
        margin: '0 auto',
      }}
    >
      <span style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--color-accent)', textTransform: 'uppercase' }}>
        Check-in
      </span>
      <h2 style={{ fontSize: 26, margin: 0, textWrap: 'balance' }}>Where does your journey begin?</h2>
      <p style={{ fontSize: 13.5, color: 'var(--color-neutral-400)', margin: 0, maxWidth: 300, lineHeight: 1.55 }}>
        Enter your home or current airport. Your route leans toward familiar skies, and we measure every mile you fly
        from here.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280, textAlign: 'left' }}>
        <label htmlFor="gc-checkin-input" style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
          Home or current airport
        </label>
        {/* 19px font: comfortably over the 16px iOS auto-zoom threshold. */}
        <input
          id="gc-checkin-input"
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resolved) onCheckIn(resolved.iata);
          }}
          placeholder="e.g. RDU or Raleigh"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          style={{
            minHeight: 52,
            padding: '6px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 19,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            borderColor: 'var(--color-accent)',
          }}
        />
        {resolved && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--color-accent-300)',
              background: 'var(--color-accent-900)',
              border: '1px solid var(--color-accent-800)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              animation: 'gcChip 0.35s ease',
            }}
          >
            {PLANE_ICON}
            <span>
              Nearest airport: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-100)' }}>{resolved.iata}</span>{' '}
              — {resolved.name}
            </span>
          </span>
        )}
        {showNoMatch && (
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            No airport matches that yet — keep typing, or try the 3-letter code.
          </span>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--color-neutral-600)' }}>
          Type a 3-letter code — or your city, and we&rsquo;ll find the closest airport.
        </span>
      </div>
      <button
        className="btn btn-primary"
        onClick={() => resolved && onCheckIn(resolved.iata)}
        disabled={!resolved}
        style={{ minHeight: 44, width: '100%', maxWidth: 280, fontSize: 15 }}
      >
        Start boarding
      </button>
    </div>
  );
}
