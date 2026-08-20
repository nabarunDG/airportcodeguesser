import { useCallback, useRef } from 'react';
import type { Mode } from '../../types';
import SplitFlapLogo from '../SplitFlapLogo';
import TrademarkFooter from '../TrademarkFooter';
import ModeSwitch from './home/ModeSwitch';
import SafetyCard from './home/SafetyCard';
import './HomeScreen.css';

interface Props {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onStart: () => void;
  onGoLeaderboard: () => void;
}

export default function HomeScreen({ mode, onSetMode, onStart, onGoLeaderboard }: Props) {
  const briefingRef = useRef<HTMLDivElement>(null);
  const scrollToBriefing = useCallback(() => {
    briefingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="gc-home">
      <div className="gc-home-inner">
        <div className="gc-home-tiles">
          <SplitFlapLogo size="lg" />
        </div>
        <h1 style={{ fontSize: 30, margin: 0 }}>Name that airport</h1>
        {/* A collection, never a mission: "how many … can you collect", not
            "collect all 10" (design handoff rule 3). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: 'var(--color-neutral-400)', margin: 0, lineHeight: 1.55 }}>
            Use clues to guess the airport code. See how many passport stamps you can collect, up to 10.
          </p>
          <p style={{ fontSize: 14, color: 'var(--color-neutral-400)', margin: 0, lineHeight: 1.55 }}>
            No clock, no pressure.
          </p>
        </div>
        <ModeSwitch mode={mode} onSetMode={onSetMode} />
        <div className="gc-home-actions">
          <button className="btn btn-pill btn-block" onClick={onStart} style={{ minHeight: 44 }}>
            Check in to play
          </button>
          <button className="btn btn-secondary btn-block" onClick={onGoLeaderboard} style={{ minHeight: 44, borderRadius: 24 }}>
            Flight Leaders
          </button>
        </div>
        <button className="gc-home-scrollcue" onClick={scrollToBriefing} type="button">
          <span>Safety briefing</span>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M1 1l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className="gc-home-briefing" ref={briefingRef}>
        <SafetyCard />
        <TrademarkFooter />
      </div>
    </div>
  );
}
