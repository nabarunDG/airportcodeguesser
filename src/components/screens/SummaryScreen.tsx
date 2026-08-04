import type { GameEngine } from '../../hooks/useGameEngine';
import { boardGroup, ffTier, todayDisplay } from '../../lib/gameLogic';
import { useLiveDuration } from '../../hooks/useLiveDuration';
import Barcode from './summary/Barcode';
import HomeAirportForm from './summary/HomeAirportForm';

interface Props {
  engine: GameEngine;
}

export default function SummaryScreen({ engine }: Props) {
  const { state } = engine;
  const batchTime = useLiveDuration(engine.batchStartMs);
  const group = boardGroup(state.score);
  const flightNo = `GC-${state.batchNum}0${state.correct}`;
  const lockNav = !state.saved && state.homeInput.length < 3;

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
        <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Barcode bars={state.barcode} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{todayDisplay()} UTC</span>
            <span>time on board {batchTime}</span>
          </div>
        </div>
      </div>

      {!state.saved && (
        <HomeAirportForm
          homeInput={state.homeInput}
          homeErr={state.homeErr}
          onChange={engine.setHomeInput}
          onSubmit={() => void engine.saveScore()}
        />
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={lockNav} onClick={engine.start} style={{ minHeight: 44 }}>
          New boarding group
        </button>
        <button className="btn btn-secondary" disabled={lockNav} onClick={engine.goLeaderboard} style={{ minHeight: 44 }}>
          Flight Leaders
        </button>
      </div>
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
