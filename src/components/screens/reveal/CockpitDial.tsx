import { dialNeedleDeg, dialOffset } from '../../../lib/gameLogic';
import './CockpitDial.css';

interface Props {
  score: number;
}

/** The semicircle gauge showing batch score-so-far, 0-100. */
export default function CockpitDial({ score }: Props) {
  const offset = dialOffset(score);
  const needleDeg = dialNeedleDeg(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width="180" height="100" viewBox="0 0 200 110">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-divider)" strokeWidth="6" strokeLinecap="round" />
        <path
          className="gc-dial-arc"
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={offset}
        />
        <g className="gc-dial-needle" style={{ transform: `rotate(${needleDeg}deg)` }}>
          <line x1="100" y1="100" x2="100" y2="32" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="6" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
        <text x="14" y="108" fill="var(--color-neutral-600)" fontSize="10" fontFamily="Inter, sans-serif">0</text>
        <text x="172" y="108" fill="var(--color-neutral-600)" fontSize="10" fontFamily="Inter, sans-serif">100</text>
      </svg>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
        {score} points this group
      </span>
    </div>
  );
}
