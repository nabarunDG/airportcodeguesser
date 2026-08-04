import type { GameEngine } from '../../hooks/useGameEngine';
import CodeTiles from './game/CodeTiles';
import ContextRow from './game/ContextRow';
import CluePills from './game/CluePills';
import HintBag from './game/HintBag';
import ChoiceList from './game/ChoiceList';

interface Props {
  engine: GameEngine;
}

export default function GameScreen({ engine }: Props) {
  const { state, currentAirport } = engine;
  if (!currentAirport) return null;

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
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <CodeTiles iata={currentAirport.iata} />
        <ContextRow airport={currentAirport} showCountry={state.hints.country} />
      </div>

      <CluePills airport={currentAirport} clues={state.clues} hints={state.hints} onPull={engine.pullClue} />

      <HintBag hints={state.hints} disabled={state.answered} onUse={engine.useHint} />

      <ChoiceList
        choices={state.choices}
        answered={state.answered}
        answeredIdx={state.answeredIdx}
        showCities={state.hints.cities}
        onPick={engine.pick}
      />
    </div>
  );
}
