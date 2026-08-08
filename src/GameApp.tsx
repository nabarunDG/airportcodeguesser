import { useEffect, useMemo, useState } from 'react';
import type { Airport } from './types';
import { useGameEngine } from './hooks/useGameEngine';
import { defaultLeaderboardClient } from './lib/leaderboardClient';
import { guessHomeAirport, type HomeGuess } from './lib/homeAirportGuess';
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

  // Resolve the opening check-in guess up front, while the player is still
  // reading the Home screen, so the screen they tap into is already filled in
  // rather than showing a spinner. Never blocks anything: if it hasn't
  // resolved (or resolved to nothing), check-in just starts empty.
  const [guess, setGuess] = useState<HomeGuess | null>(null);
  useEffect(() => {
    let live = true;
    void guessHomeAirport(airports, state.homeAirport ? (byCode[state.homeAirport] ?? null) : null).then((g) => {
      if (live) setGuess(g);
    });
    return () => {
      live = false;
    };
    // Keyed on the saved code, not the whole engine state: re-running on every
    // round would refetch the edge location each time.
  }, [airports, byCode, state.homeAirport]);

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
        return <CheckinScreen airports={airports} byCode={byCode} guess={guess} onCheckIn={engine.checkIn} />;
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
  }, [state.screen, state.mode, guess, engine, airports, byCode]);

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
