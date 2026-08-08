import { useEffect, useMemo } from 'react';
import type { Airport } from './types';
import { useGameEngine } from './hooks/useGameEngine';
import { defaultLeaderboardClient } from './lib/leaderboardClient';
import { startMetricsPing } from './lib/metrics';
import Header from './components/Header';
import CloudBackground from './components/CloudBackground';
import IdleDialog from './components/IdleDialog';
import ClueNudgeToast from './components/ClueNudgeToast';
import HomeScreen from './components/screens/HomeScreen';
import CheckinScreen from './components/screens/CheckinScreen';
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

  // Anonymous, first-party usage telemetry — see src/lib/metrics.ts. Not
  // displayed anywhere in the app.
  useEffect(() => startMetricsPing(), []);

  const screen = useMemo(() => {
    switch (state.screen) {
      case 'home':
        return (
          <HomeScreen
            mode={state.mode}
            onSetMode={engine.setMode}
            onStart={engine.goCheckin}
            onGoLeaderboard={engine.goLeaderboard}
          />
        );
      case 'checkin':
        return <CheckinScreen airports={airports} byCode={byCode} homeAirport={state.homeAirport} onCheckIn={engine.checkIn} />;
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
  }, [state.screen, state.mode, state.homeAirport, engine, airports, byCode]);

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
      <Header inPlay={inPlay} mode={state.mode} roundNo={state.roundIdx + 1} score={state.score} onGoHome={engine.goHome} />
      {/* Keyed on the screen name so the runway fade replays per transition. */}
      <div key={state.screen} className="gc-screen">
        {screen}
      </div>
      {state.nudge && <IdleDialog onDismiss={engine.dismissNudge} />}
      {state.clueNudge && !state.nudge && <ClueNudgeToast onDismiss={engine.act} />}
    </div>
  );
}
