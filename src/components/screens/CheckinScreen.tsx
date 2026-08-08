import { useEffect, useMemo, useState } from 'react';
import type { Airport } from '../../types';
import { nearestAirports, searchAirportsWithCities } from '../../lib/gameLogic';
import { browserTimezone, type HomeGuess } from '../../lib/homeAirportGuess';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useCityIndex } from '../../hooks/useCityIndex';

interface Props {
  airports: Airport[];
  byCode: Record<string, Airport>;
  /** Opening guess, resolved while the player was still on the Home screen. */
  guess: HomeGuess | null;
  onCheckIn: (iata: string) => void;
}

/** Where the candidates on screen came from — drives the note and whether we preselect. */
type Origin = 'saved' | 'connection' | 'timezone' | 'typed' | 'device' | 'none';

/**
 * Check-in. Required before round 1, so it leads with the answer rather than
 * an empty field: the guess (see homeAirportGuess) is already resolved, the
 * primary pill names it, and the input below is framed as a correction.
 *
 * The one exception is a timezone-only guess. That layer collapses a whole
 * zone to its biggest airport — every player in America/New_York would be
 * handed ATL — and the home airport decides where scores post and what
 * distances are measured from, so a wrong one quietly corrupts both. When
 * that's all we have, the pill stays disabled until the player picks.
 */
export default function CheckinScreen({ airports, byCode, guess, onCheckIn }: Props) {
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<Airport | null>(null);
  /** Set when the player chooses a row themselves — at that point it stops being a guess. */
  const [chosen, setChosen] = useState(false);
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

  // Precedence: what you typed, else where your device says you are, else the
  // opening guess.
  let candidates: Airport[];
  let distances: Map<string, number> | null = null;
  let origin: Origin;
  if (typed.length >= 3 && searchResults.length > 0) {
    candidates = searchResults;
    origin = 'typed';
  } else if (geoCandidates) {
    candidates = geoCandidates.map((n) => n.airport);
    distances = new Map(geoCandidates.map((n) => [n.airport.iata, n.km]));
    origin = 'device';
  } else {
    candidates = guess?.candidates ?? [];
    origin = guess?.source ?? 'none';
  }

  // Typing and tapping "use my location" are deliberate acts, and a saved or
  // connection-derived airport is specific enough to stand on its own. Only
  // the timezone guess has to be confirmed by hand.
  const preselects = origin !== 'timezone' && origin !== 'none';
  const selected = picked ?? (preselects ? (candidates[0] ?? null) : null);
  const noMatch = typed.length >= 3 && searchResults.length === 0;

  // Nothing for a saved airport — announcing that we remembered it sits badly
  // next to "we don't store your location", and a silent prefill is what any
  // form would do anyway. Nothing once they've chosen a row either: at that
  // point it's their answer, not our guess.
  const note = chosen
    ? ''
    : origin === 'connection'
      ? 'Guessed from connection'
      : origin === 'timezone'
        ? `Guessed from timezone${selected ? '' : ' — pick yours below.'}`
        : origin === 'device'
          ? 'From your device location'
          : '';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 14,
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
        Your route leans towards familiar skies, and mileage counts.
      </p>

      {/* The answer comes first: confirm, then correct. */}
      <button
        className="btn btn-pill"
        onClick={() => selected && onCheckIn(selected.iata)}
        disabled={!selected}
        style={{ minHeight: 44, width: '100%', maxWidth: 300, marginTop: 2 }}
      >
        {selected ? `Start boarding from ${selected.iata}` : 'Choose your airport'}
      </button>

      {/* Naming the airport under the pill is what stops a blind tap — a bare
          3-letter code invites people not to look. */}
      {selected && (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', maxWidth: 300, lineHeight: 1.4 }}>
          {selected.name} · {selected.city_name}, {selected.country}
        </span>
      )}
      {note && <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{note}</span>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300, textAlign: 'left' }}>
        <label htmlFor="gc-checkin-input" style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
          {selected ? 'Change your airport' : 'Find your airport'}
        </label>
        {/* 19px: comfortably over the 16px iOS auto-zoom threshold. */}
        <input
          id="gc-checkin-input"
          className="input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPicked(null);
            setChosen(false);
            setGeoCandidates(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && selected) onCheckIn(selected.iata);
          }}
          placeholder="Code or city"
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

        {/* Hidden once the player has explicitly picked a row — at that point
            the pill and name line above already show the answer, and the same
            list sitting there too just reads as clutter. Retyping resets
            `chosen` (see the input's onChange) and brings the list back for
            the new query. */}
        {!chosen && candidates.length > 0 && (
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
                  onClick={() => {
                    setPicked(a);
                    setChosen(true);
                  }}
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
    </div>
  );
}
