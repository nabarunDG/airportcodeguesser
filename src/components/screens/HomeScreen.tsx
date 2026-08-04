import BaggageCarousel from '../BaggageCarousel';
import './HomeScreen.css';

interface Props {
  onStart: () => void;
  onGoLeaderboard: () => void;
}

export default function HomeScreen({ onStart, onGoLeaderboard }: Props) {
  return (
    <div className="gc-home">
      <div className="gc-home-inner">
        <div className="gc-home-tiles">
          <div className="gc-home-tile" style={{ color: 'var(--color-accent)' }}>?</div>
          <div className="gc-home-tile" style={{ color: 'var(--color-text)' }}>?</div>
          <div className="gc-home-tile" style={{ color: 'var(--color-neutral-500)' }}>?</div>
        </div>
        <h1 style={{ fontSize: 34, margin: 0 }}>Name that airport</h1>
        <p style={{ fontSize: 14.5, color: 'var(--color-neutral-400)', margin: 0 }}>
          Read clues and pick the right airport. 10 airport codes per boarding group. No clock, no pressure. Hints
          cost you −2 points. Score points for your home or current airport!
        </p>
        <div className="gc-home-actions">
          <button className="btn btn-primary btn-block" onClick={onStart} style={{ minHeight: 44, fontSize: 15 }}>
            Start boarding
          </button>
          <button className="btn btn-secondary btn-block" onClick={onGoLeaderboard} style={{ minHeight: 44 }}>
            Flight Leaders
          </button>
        </div>
        <div className="gc-home-belt">
          <BaggageCarousel />
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-neutral-600)', margin: '4px 0 0' }}>
          10 points per correct answer · max 100 points per group
        </p>
      </div>
    </div>
  );
}
