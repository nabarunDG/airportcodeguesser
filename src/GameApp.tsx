import { useMemo } from 'react';
import type { Airport } from './types';
import { useGameEngine } from './hooks/useGameEngine';
import { defaultLeaderboardClient } from './lib/leaderboardClient';
import Header from './components/Header';
import CloudBackground from './components/CloudBackground';
import IdleDialog from './components/IdleDialog';
import HomeScreen from './components/screens/HomeScreen';
import GameScreen from './components/screens/GameScreen';
import RevealScreen from './components/screens/RevealScreen';
import SummaryScreen from './components/screens/SummaryScreen';
import LeaderboardScreen from './components/screens/LeaderboardScreen';

interface Props {
  airports: Airport[];
  byCode: Record<string, Airport>;
}

export default function GameApp({ airports, byCode }: Props) {
  const engine = useGameEngine(airports, byCode, defaultLeaderboardClient);
  const { state } = engine;
  const inPlay = state.screen === 'game' || state.screen === 'reveal';

  const screen = useMemo(() => {
    switch (state.screen) {
      case 'home':
        return <HomeScreen onStart={engine.start} onGoLeaderboard={engine.goLeaderboard} />;
      case 'game':
        return <GameScreen engine={engine} />;
      case 'reveal':
        return <RevealScreen engine={engine} />;
      case 'summary':
        return <SummaryScreen engine={engine} />;
      case 'leaderboard':
        return <LeaderboardScreen engine={engine} />;
      default:
        return null;
    }
  }, [state.screen, engine]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
        color: 'var(--color-text)',
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      <CloudBackground />
      <Header inPlay={inPlay} roundNo={state.roundIdx + 1} score={state.score} onGoHome={engine.goHome} />
      {screen}
      {state.nudge && <IdleDialog onDismiss={engine.dismissNudge} />}
    </div>
  );
}
