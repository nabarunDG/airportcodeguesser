import type { GameEngine } from '../../../hooks/useGameEngine';
import { weekRangeDisplay } from '../../../lib/gameLogic';

interface Props {
  engine: GameEngine;
}

/**
 * The "Flight Leaders" board — week-range header, a same-day activity strip,
 * and the sortable ranked table. Shared between the standalone Leaderboard
 * screen and the Summary screen (rendered as the boarding pass's "stub"),
 * so both read from the same weekly data with no duplicated table logic.
 * Scores post themselves to the check-in airport now, so there's no inline
 * "add your airport" form anymore.
 */
export default function FlightLeadersBoard({ engine }: Props) {
  const { state } = engine;
  const byAvg = state.lbSort === 'avg';
  const arrow = (active: boolean) => (active ? (state.lbDir === 'desc' ? '▼' : '▲') : '⇅');
  const { topTotal, topAvg } = state.lbWinners;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <span className="card-kicker">Flight Leaders</span>
        <p style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {weekRangeDisplay()} UTC · Defend your airport's spot
        </p>
      </div>

      {(topTotal || topAvg) && (
        <p style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          Last week's winners:{' '}
          {topTotal && (
            <>
              {topTotal.airport} with {topTotal.score} total points
            </>
          )}
          {topTotal && topAvg && ', and '}
          {topAvg && (
            <>
              {topAvg.airport} with {topAvg.avg} highest average points
            </>
          )}
        </p>
      )}

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
                {/* A check reads as "this is the one you posted" without the
                    weight of a filled tag beside every other row's bare code. */}
                {r.you && (
                  <span
                    aria-label="the airport you posted"
                    title="The airport you posted"
                    style={{ marginLeft: 7, color: 'var(--color-accent)', fontSize: 12 }}
                  >
                    ✓
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
        <p style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>No scores posted this week yet — be the first on the list.</p>
      )}
    </div>
  );
}
