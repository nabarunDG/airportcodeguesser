import type { GameEngine } from '../../hooks/useGameEngine';
import { fmtDistance, nextMilestone, scoreGaugeCalibration } from '../../lib/gameLogic';
import PassportStamp from '../PassportStamp';
import CockpitGauge from './reveal/CockpitGauge';
import StampStrip from './game/StampStrip';

interface Props {
  engine: GameEngine;
}

export default function RevealScreen({ engine }: Props) {
  const { state, currentAirport } = engine;
  if (!currentAirport) return null;

  const verdict = state.timedOut ? 'TAXIED AWAY' : state.answeredIdx >= 0 && state.choices[state.answeredIdx]?.ok ? 'CORRECT' : 'NOT QUITE';
  const verdictOk = verdict === 'CORRECT';
  const verdictNo = verdict !== 'CORRECT' && !state.timedOut;
  const verdictBg = verdictOk ? 'var(--color-accent-800)' : 'var(--color-neutral-800)';
  const verdictColor = verdictOk ? 'var(--color-accent-100)' : 'var(--color-neutral-200)';

  const pts = state.lastRoundPoints;
  const stamp = state.lastRoundStamp;
  // Only FF's priced city hints can shave the round score — name the count so
  // a sub-10 round reads as spent, not broken.
  const paidHints = state.mode === 'ff' ? state.revealedCities.length : 0;
  let ptsLine = state.timedOut ? 'Round skipped — 0 pts' : pts > 0 ? `+${pts} pts` : 'No points this round';
  if (pts > 0 && paidHints > 0) {
    ptsLine += ` (${paidHints} hint${paidHints > 1 ? 's' : ''} used)`;
  }
  if (pts > 0 && state.lastUpgradeBonus > 0) {
    ptsLine += ` · Upgrade bonus +${state.lastUpgradeBonus} — ${state.streak} in a row`;
  }
  const ptsColor = pts > 0 ? 'var(--color-accent-300)' : 'var(--color-neutral-500)';

  const continentsTouched = new Set(state.stamps.map((s) => s.continent)).size;
  const tease = nextMilestone(state.stamps.length);
  const nextLabel = state.roundIdx + 1 >= 10 ? 'See Results' : 'Next code';
  // The dial is calibrated to this mode's true ceiling (GB 160, FF 210) so a
  // perfect batch lands near the stop instead of pegging past it.
  const dial = scoreGaugeCalibration(state.mode);

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
        gap: 13,
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

      {/* Oregon-Trail event line — fires on ~40% of reveals, positive pool on
          a correct answer, negative on a wrong/skip. A treat, not wallpaper. */}
      {state.eventLine && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: verdictOk ? 'var(--color-accent-300)' : 'var(--color-neutral-400)',
            background: verdictOk ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
            borderRadius: 20,
            padding: '6px 14px',
            animation: 'gcChip 0.4s ease 0.15s both',
          }}
        >
          {verdictOk ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.5 18a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.5A4 4 0 0 0 7 18Z" />
            </svg>
          )}
          {state.eventLine}
        </span>
      )}

      {/* The identity block owns the full width so the code, name and city stay
          optically centred whatever the name's length — putting the stamp in
          this row instead pushed a long name ("General Mitchell International")
          off-centre and crowded its right edge. The stamp gets its own line. */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* lineHeight:1 on the code — its inherited body leading (1.55) was
            adding ~22px of empty space above the name below it for no reason
            a big display number actually needs. That gap was the single
            biggest thing standing between the fold and the stamp strip on a
            phone screen. */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, lineHeight: 1, color: 'var(--color-accent)' }}>{currentAirport.iata}</div>
        <h2 style={{ fontSize: 24, margin: 0, lineHeight: 1.15, textWrap: 'balance' }}>{currentAirport.name}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-neutral-400)', margin: 0 }}>
          {currentAirport.city_name} · {currentAirport.country}
        </p>
        <p style={{ fontSize: 14, margin: '4px 0 0', color: ptsColor }}>{ptsLine}</p>
        {state.lastLegKm != null && state.lastLegFrom && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'var(--color-neutral-400)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--color-neutral-500)" aria-hidden="true">
              <path d="M21 16v-2l-8-2.5V6a1.5 1.5 0 0 0-3 0v5.5L2 14v2l8-1.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-4.5z" />
            </svg>
            <span>
              You flew <span style={{ color: 'var(--color-text)' }}>{fmtDistance(state.lastLegKm)}</span> from {state.lastLegFrom}
            </span>
          </span>
        )}
      </div>

      {/* Only a country's first stamp of the day gets the press animation —
          across ten rounds the flourish would otherwise wear thin. */}
      {stamp && <PassportStamp stamp={stamp} animate={stamp.firstVisit} width={124} />}

      <div className="card elev-sm" style={{ maxWidth: 380, width: '100%', textAlign: 'left' }}>
        <span className="card-kicker">From the flight logs</span>
        <p className="card-body" style={{ fontSize: 13.5 }}>{state.fact}</p>
      </div>

      <button className="btn btn-pill" onClick={engine.next} style={{ minHeight: 46, minWidth: 220 }}>
        {nextLabel}
      </button>

      {/* Cockpit instrument panel — score calibrated to the ceiling with every
          bonus banked, flanked by the continents and streak dials. The side
          column is pinned to the big dial's height so the panel reads as one
          assembly, not three loose parts. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <CockpitGauge
          label="SCORE"
          value={state.score}
          max={dial.max}
          majors={dial.majors}
          minorsPerInterval={dial.minorsPerInterval}
          accentZone={[100, dial.max]}
          size={172}
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 172 }}>
          <CockpitGauge
            label="Continents"
            labelPosition="above"
            value={continentsTouched}
            max={6}
            majors={[0, 1, 2, 3, 4, 5, 6]}
            minorsPerInterval={1}
            size={66}
          />
          <CockpitGauge
            label="Streak"
            labelPosition="above"
            value={state.streak}
            max={10}
            majors={[0, 2, 4, 6, 8, 10]}
            minorsPerInterval={1}
            accentZone={[3, 10]}
            size={66}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <StampStrip stamps={state.stamps} small />
        {/* Tease the next milestone, never demand it — a collection, not a mission. */}
        {tease ? (
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
            {tease.need} more for a {tease.name}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-accent-300)' }}>World tour — every stamp collected</span>
        )}
      </div>
    </div>
  );
}
