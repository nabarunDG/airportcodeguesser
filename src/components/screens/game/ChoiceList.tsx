import type { Choice } from '../../../types';
import { CITY_REVEAL_COST } from '../../../lib/gameLogic';

interface Props {
  choices: Choice[];
  answered: boolean;
  answeredIdx: number;
  revealedCities: number[];
  onPick: (idx: number) => void;
  onRevealCity: (idx: number) => void;
}

export default function ChoiceList({ choices, answered, answeredIdx, revealedCities, onPick, onRevealCity }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
        Stuck? Tap <span style={{ color: 'var(--color-neutral-400)' }}>City</span> beside an option to see where it is,
        for −{CITY_REVEAL_COST} pt.
      </div>
      {choices.map((c, i) => {
        const isPicked = answeredIdx === i;
        const revealed = revealedCities.includes(i);
        let border = 'var(--color-divider)';
        let bg = 'var(--color-surface)';
        let opacity = 1;
        if (answered) {
          if (c.ok) {
            border = 'var(--color-accent)';
            bg = 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))';
          } else if (isPicked) {
            border = 'var(--color-neutral-500)';
            opacity = 0.75;
          } else {
            opacity = 0.4;
          }
        }
        return (
          // Side by side, not stacked. The hint used to be absolutely
          // positioned on top of the answer button, so its tap target sat
          // inside the answer's — right under where a right-handed thumb
          // rests — and picking an option could spend a point instead. As
          // siblings with a gap between them, the two targets never overlap.
          <div key={c.airport.iata} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <button
              onClick={() => onPick(i)}
              style={{
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
                minHeight: 52,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: bg,
                border: `1px solid ${border}`,
                color: 'var(--color-text)',
                opacity,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 2,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{c.airport.name}</span>
              {revealed && (
                <span style={{ fontSize: 12, color: 'var(--color-accent-300)', animation: 'gcChip 0.35s ease' }}>
                  {c.airport.city_name}, {c.airport.country}
                </span>
              )}
            </button>
            {!revealed && !answered && (
              <button
                onClick={() => onRevealCity(i)}
                aria-label={`Reveal the city for ${c.airport.name}, costs ${CITY_REVEAL_COST} point`}
                style={{
                  font: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  flex: 'none',
                  width: 52,
                  color: 'var(--color-neutral-400)',
                  background: 'transparent',
                  border: '1px solid var(--color-divider)',
                  borderRadius: 'var(--radius-md)',
                  padding: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                City
                <span style={{ display: 'block', fontSize: 9.5, color: 'var(--color-neutral-600)' }}>−{CITY_REVEAL_COST}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
