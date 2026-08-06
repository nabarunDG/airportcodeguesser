import type { GameEngine } from '../../hooks/useGameEngine';
import PassportStamp from '../PassportStamp';
import CockpitDial from './reveal/CockpitDial';

interface Props {
  engine: GameEngine;
}

export default function RevealScreen({ engine }: Props) {
  const { state, currentAirport, hintsUsedThisRound } = engine;
  if (!currentAirport) return null;

  const verdict = state.timedOut ? 'TAXIED AWAY' : state.answeredIdx >= 0 && state.choices[state.answeredIdx]?.ok ? 'CORRECT' : 'NOT QUITE';
  const verdictOk = verdict === 'CORRECT';
  const verdictNo = verdict !== 'CORRECT' && !state.timedOut;
  const verdictBg = verdictOk ? 'var(--color-accent-800)' : 'var(--color-neutral-800)';
  const verdictColor = verdictOk ? 'var(--color-accent-100)' : 'var(--color-neutral-200)';

  const pts = state.lastRoundPoints;
  const stamp = state.lastRoundStamp;
  const ptsLine = state.timedOut
    ? 'Round skipped — 0 pts'
    : pts > 0
      ? `+${pts} pts${hintsUsedThisRound ? ` (${hintsUsedThisRound} hint${hintsUsedThisRound > 1 ? 's' : ''} used)` : ''}`
      : 'No points this round';
  const ptsColor = pts > 0 ? 'var(--color-accent-300)' : 'var(--color-neutral-500)';

  const nextLabel = state.roundIdx + 1 >= 10 ? 'See boarding pass' : 'Next code';

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 620,
        margin: '0 auto',
        padding: '12px 20px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 18px',
          borderRadius: 22,
          whiteSpace: 'nowrap',
          background: verdictBg,
          color: verdictColor,
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 16,
          letterSpacing: '0.1em',
          animation: 'gcChip 0.4s ease',
        }}
      >
        {verdictOk && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12.5 10 18 19.5 6.5" />
          </svg>
        )}
        {verdictNo && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        )}
        <span>{verdict}</span>
      </div>

      {/* The stamp sits beside the airport identity on wide screens and wraps
          under it on narrow ones, rather than displacing the score line. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, color: 'var(--color-accent)' }}>{currentAirport.iata}</div>
          <h2 style={{ fontSize: 26, margin: 0 }}>{currentAirport.name}</h2>
          <p style={{ fontSize: 14, color: 'var(--color-neutral-400)', margin: 0 }}>
            {currentAirport.city_name} · {currentAirport.country}
          </p>
          <p style={{ fontSize: 14, margin: '6px 0 0', color: ptsColor }}>{ptsLine}</p>
        </div>
        {/* Only a country's first stamp of the day gets the press animation —
            across ten rounds the flourish would otherwise wear thin. */}
        {stamp && <PassportStamp stamp={stamp} animate={stamp.firstVisit} width={112} />}
      </div>

      <div className="card elev-sm" style={{ maxWidth: 380, width: '100%', textAlign: 'left' }}>
        <span className="card-kicker">From the flight logs</span>
        <p className="card-body" style={{ fontSize: 13.5 }}>{state.fact}</p>
      </div>

      <CockpitDial score={state.score} />

      <button className="btn btn-primary" onClick={engine.next} style={{ minHeight: 46, minWidth: 220 }}>
        {nextLabel}
      </button>
    </div>
  );
}
