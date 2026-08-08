import type { GameEngine } from '../../hooks/useGameEngine';
import CodeTiles from './game/CodeTiles';
import ContextRow from './game/ContextRow';
import CluePills from './game/CluePills';
import ChoiceList from './game/ChoiceList';
import StampStrip from './game/StampStrip';

interface Props {
  engine: GameEngine;
}

export default function GameScreen({ engine }: Props) {
  const { state, currentAirport, byCode } = engine;
  if (!currentAirport) return null;
  const gb = state.mode === 'gb';

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 620,
        margin: '0 auto',
        padding: '4px 20px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <StampStrip stamps={state.stamps} />

      {/* The elite-perks banner introduces the fare once, on round 1 — after
          that it's wallpaper the stamp strip and choices deserve back. */}
      {!gb && state.roundIdx === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--color-accent-300)',
            background: 'var(--color-accent-900)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 12px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3l2.4 5.4 5.6.6-4.2 3.9 1.2 5.6-5-2.9-5 2.9 1.2-5.6L4 9l5.6-.6Z" />
          </svg>
          Elite fare: +20 bonus at landing · upgrade streaks count double
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <CodeTiles iata={currentAirport.iata} />
        {/* Country stays behind the reveal pill in both modes — free in GB,
            −2 in FF. */}
        <ContextRow airport={currentAirport} showCountry={state.hints.country} />
      </div>

      <CluePills
        airport={currentAirport}
        byCode={byCode}
        mode={state.mode}
        clues={state.clues}
        hints={state.hints}
        disabled={state.answered}
        onPull={engine.pullClue}
        onUseHint={engine.useHint}
      />

      <ChoiceList
        choices={state.choices}
        mode={state.mode}
        answered={state.answered}
        answeredIdx={state.answeredIdx}
        revealedCities={state.revealedCities}
        onPick={engine.pick}
        onRevealCity={engine.revealCity}
      />
    </div>
  );
}
