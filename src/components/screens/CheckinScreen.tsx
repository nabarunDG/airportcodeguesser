import { useEffect, useMemo, useState } from 'react';
import type { Airport } from '../../types';
import { nearestAirports, searchAirportsWithCities } from '../../lib/gameLogic';
import { browserTimezone, type GuessSource, type HomeGuess } from '../../lib/homeAirportGuess';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useCityIndex } from '../../hooks/useCityIndex';

interface Props {
  airports: Airport[];
  byCode: Record<string, Airport>;
  /** Opening guess, resolved while the player was still on the Home screen. */
  guess: HomeGuess | null;
  onCheckIn: (iata: string) => void;
}

const PLANE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 16v-2l-8-2.5V6a1.5 1.5 0 0 0-3 0v5.5L2 14v2l8-1.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-4.5z" />
  </svg>
);

const PROVENANCE: Record<GuessSource, string> = {
  saved: 'Where you flew from last time',
  connection: 'Guessed from your connection',
  timezone: 'Guessed from your timezone',
  none: '',
};

/**
 * Check-in. Required before round 1, so it must never be a blank required
 * field: it arrives with a best guess already selected (see homeAirportGuess)
 * and the primary button names it — "Start boarding from RDU". Typing is a
 * correction, and because 21 city names in the dataset span more than one
 * country, corrections are offered as a list rather than resolved silently.
 */
export default function CheckinScreen({ airports, byCode, guess, onCheckIn }: Props) {
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<Airport | null>(null);
  const cityIndex = useCityIndex();
  const geo = useGeolocation();

  // Distances only exist on the location path; kept beside the candidates so
  // a row can show "· 24 km" without recomputing.
  const [geoCandidates, setGeoCandidates] = useState<Array<{ airport: Airport; km: number }> | null>(null);
  useEffect(() => {
    if (geo.status === 'ready' && geo.coords) {
      const near = nearestAirports(airports, geo.coords.lat, geo.coords.lon);
      setGeoCandidates(near);
      setPicked(near[0]?.airport ?? null);
      setInput('');
    }
  }, [airports, geo.coords, geo.status]);

  // The player's zone breaks ties between same-named cities, so someone in
  // Ontario typing "london" gets YXU ahead of Heathrow.
  const timezone = useMemo(() => browserTimezone(), []);
  const typed = input.trim();
  const searchResults = useMemo(
    () => (typed.length >= 3 ? searchAirportsWithCities(airports, byCode, cityIndex, typed, 5, timezone) : []),
    [airports, byCode, cityIndex, typed, timezone],
  );

  // Precedence: what you typed, else where you are, else the opening guess.
  let candidates: Airport[];
  let distances: Map<string, number> | null = null;
  let source: GuessSource | 'typed' | 'device' = guess?.source ?? 'none';
  if (typed.length >= 3 && searchResults.length > 0) {
    candidates = searchResults;
    source = 'typed';
  } else if (geoCandidates) {
    candidates = geoCandidates.map((n) => n.airport);
    distances = new Map(geoCandidates.map((n) => [n.airport.iata, n.km]));
    source = 'device';
  } else {
    candidates = guess?.candidates ?? [];
  }

  // The selection survives input that matches nothing, so a stray keystroke
  // can never strand the player behind a disabled button.
  const selected = picked ?? candidates[0] ?? guess?.airport ?? null;
  const noMatch = typed.length >= 3 && searchResults.length === 0;

  const provenance =
    source === 'typed' ? '' : source === 'device' ? 'From your device location' : PROVENANCE[source as GuessSource];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 16,
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
        Your route leans toward familiar skies, and we measure every mile you fly from here.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300, textAlign: 'left' }}>
        <label htmlFor="gc-checkin-input" style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
          Home or current airport
        </label>
        {/* 19px: comfortably over the 16px iOS auto-zoom threshold. */}
        <input
          id="gc-checkin-input"
          className="input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPicked(null);
            setGeoCandidates(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && selected) onCheckIn(selected.iata);
          }}
          placeholder="Code, city or town"
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

        {candidates.length > 0 && (
          <div role="radiogroup" aria-label="Choose your airport" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((a) => {
              const active = selected?.iata === a.iata;
              const km = distances?.get(a.iata);
              return (
                <button
                  key={a.iata}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPicked(a)}
                  style={{
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: active ? 'var(--color-accent-900)' : 'var(--color-surface)',
                    border: `1px solid ${active ? 'var(--color-accent-600)' : 'var(--color-divider)'}`,
                    color: 'var(--color-text)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: active ? 'var(--color-accent-200)' : 'var(--color-neutral-300)' }}>
                    {a.iata}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
                      {a.city_name}, {a.country}
                      {km != null && ` · ${Math.round(km)} km`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {provenance && candidates.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-neutral-600)' }}>
            {PLANE_ICON}
            {provenance} — change it above if that&rsquo;s not you.
          </span>
        )}

        {noMatch && (
          <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
            No airport by that name. Try a larger city nearby, the 3-letter code, or use your location below.
          </span>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          <button
            type="button"
            onClick={geo.request}
            disabled={geo.status === 'locating'}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              cursor: geo.status === 'locating' ? 'default' : 'pointer',
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 14px',
              borderRadius: 20,
              background: 'transparent',
              border: '1px solid var(--color-divider)',
              color: 'var(--color-text)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="10" r="3" />
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" strokeLinejoin="round" />
            </svg>
            {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
            We don&rsquo;t store your location, it&rsquo;s just to get you going.
          </span>
          {geo.status === 'denied' && (
            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
              Location is blocked in your browser — no problem, type a city or code instead.
            </span>
          )}
          {geo.status === 'unavailable' && (
            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
              Couldn&rsquo;t get a location just now — type a city or code instead.
            </span>
          )}
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={() => selected && onCheckIn(selected.iata)}
        disabled={!selected}
        style={{ minHeight: 44, width: '100%', maxWidth: 300, fontSize: 15 }}
      >
        {selected ? `Start boarding from ${selected.iata}` : 'Start boarding'}
      </button>
    </div>
  );
}
