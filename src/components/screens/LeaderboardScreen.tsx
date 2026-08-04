import type { GameEngine } from '../../hooks/useGameEngine';
import { todayDisplay } from '../../lib/gameLogic';

interface Props {
  engine: GameEngine;
}

export default function LeaderboardScreen({ engine }: Props) {
  const { state } = engine;
  const byAvg = state.lbSort === 'avg';
  const arrow = (active: boolean) => (active ? (state.lbDir === 'desc' ? '▼' : '▲') : '⇅');

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
        gap: 16,
      }}
    >
      <div>
        <h2 style={{ fontSize: 24, margin: '0 0 4px' }}>Flight Leaders</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-neutral-500)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          {todayDisplay()} UTC · Score points for your airport!
        </p>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40, textAlign: 'center' }}>#</th>
            <th>Airport</th>
            <th style={{ textAlign: 'center' }}>PAX</th>
            <th style={{ textAlign: 'center' }}>Rounds</th>
            <th style={{ textAlign: 'center' }}>
              <span
                onClick={engine.sortByAvg}
                style={{ cursor: 'pointer', userSelect: 'none', color: byAvg ? 'var(--color-accent)' : 'inherit' }}
              >
                Avg {arrow(byAvg)}
              </span>
            </th>
            <th style={{ textAlign: 'center' }}>
              <span
                onClick={engine.sortByTotal}
                style={{ cursor: 'pointer', userSelect: 'none', color: !byAvg ? 'var(--color-accent)' : 'inherit' }}
              >
                Score {arrow(!byAvg)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {state.lbRows.map((r) => (
            <tr key={r.airport}>
              <td style={{ textAlign: 'center', color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>{r.rank}</td>
              <td>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{r.airport}</span>
                {r.you && (
                  <span className="tag tag-accent" style={{ marginLeft: 8, fontSize: 9.5 }}>
                    YOURS
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-400)' }}>{r.pax}</td>
              <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-400)' }}>{r.rounds}</td>
              <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-400)' }}>{r.avg.toFixed(1)}</td>
              <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent-300)' }}>{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.lbRows.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>No scores posted today yet — be the first on the list.</p>
      )}
      <div>
        <button className="btn btn-secondary" onClick={engine.goHome} style={{ minHeight: 44 }}>
          Back to gate
        </button>
      </div>
    </div>
  );
}
