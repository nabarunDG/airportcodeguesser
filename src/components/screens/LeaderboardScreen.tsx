import type { GameEngine } from '../../hooks/useGameEngine';
import FlightLeadersBoard from './summary/FlightLeadersBoard';

interface Props {
  engine: GameEngine;
}

export default function LeaderboardScreen({ engine }: Props) {
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
      <FlightLeadersBoard engine={engine} />
      <div>
        <button className="btn btn-secondary" onClick={engine.goHome} style={{ minHeight: 44 }}>
          Back to gate
        </button>
      </div>
    </div>
  );
}
