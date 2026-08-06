import { useCallback, useState } from 'react';
import type { GameEngine } from '../../hooks/useGameEngine';
import { boardGroup, ffTier, fmtDur, todayDisplay } from '../../lib/gameLogic';
import PassportStamp from '../PassportStamp';
import Barcode from './summary/Barcode';
import FlightLeadersBoard from './summary/FlightLeadersBoard';
import PassportBook from './summary/PassportBook';

interface Props {
  engine: GameEngine;
}

export default function SummaryScreen({ engine }: Props) {
  const { state } = engine;
  // The passport opens over this screen on arrival, then folds itself away
  // into the row below — a transition, not a block, so Flight Leaders keeps
  // its place. Reopenable from the row.
  const [passportOpen, setPassportOpen] = useState(state.stamps.length > 0);
  const closePassport = useCallback(() => setPassportOpen(false), []);
  const onOpenPassport = useCallback(() => setPassportOpen(true), []);
  // Static, not a live ticking duration: "time on board" is the flight time
  // for the batch, fixed when its last round was answered (state.batchEndMs).
  const batchTime =
    engine.batchStartMs != null && state.batchEndMs != null
      ? fmtDur(Math.max(0, Math.floor((state.batchEndMs - engine.batchStartMs) / 1000)))
      : '—';
  const group = boardGroup(state.score);
  const flightNo = `GC-${state.batchNum}0${state.correct}`;

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
        gap: 20,
      }}
    >
      <div style={{ width: 'min(400px, 100%)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-section)' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, letterSpacing: '0.12em', fontSize: 13 }}>GATE CHECK AIR</span>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-300)', fontVariantNumeric: 'tabular-nums' }}>GROUP {group}</span>
        </div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 10px', textAlign: 'left' }}>
          <SummaryField label="Frequent Flyer Status" value={ffTier(state.score)} accent />
          <SummaryField label="Flight" value={flightNo} mono />
          <SummaryField label="Correct" value={`${state.correct} / 10`} mono />
          <SummaryField label="Hints used" value={String(state.hintsUsedTotal)} mono />
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 4 }}>
            <span style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>Score</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 40, color: 'var(--color-accent)', lineHeight: 1 }}>{state.score}</span>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>/ 100</span>
          </div>
        </div>
        {state.stamps.length > 0 && (
          <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '14px 18px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>
                Passport · {state.stamps.length} stamp{state.stamps.length > 1 ? 's' : ''}
              </span>
              <button
                onClick={onOpenPassport}
                style={{
                  font: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: 'var(--color-accent)',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Open passport
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px', alignItems: 'center' }}>
              {state.stamps.map((stamp, i) => (
                <PassportStamp key={`${stamp.iata}-${i}`} stamp={stamp} width={54} />
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Barcode bars={state.barcode} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{todayDisplay()} UTC</span>
            <span>time on board {batchTime}</span>
          </div>
        </div>

        {/* The leaderboard as the boarding pass's "stub" — same card, torn off
            rather than a separate screen, so it's impossible to miss after
            finishing a batch (see the implementation plan's UX rationale). */}
        <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '16px 18px', textAlign: 'left' }}>
          <FlightLeadersBoard engine={engine} showPrompt />
        </div>
      </div>

      <button className="btn btn-primary" onClick={engine.start} style={{ minHeight: 44, minWidth: 220 }}>
        New boarding group
      </button>

      {passportOpen && state.stamps.length > 0 && (
        <PassportBook stamps={state.stamps} score={state.score} flightNo={flightNo} onClose={closePassport} />
      )}
    </div>
  );
}

function SummaryField({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          color: accent ? 'var(--color-accent-300)' : undefined,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
