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
        Stuck? Reveal an option's city for −{CITY_REVEAL_COST} pt.
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
          <div key={c.airport.iata} style={{ position: 'relative' }}>
            <button
              onClick={() => onPick(i)}
              style={{
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                minHeight: 52,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: bg,
                border: `1px solid ${border}`,
                color: 'var(--color-text)',
                opacity,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: 15, paddingRight: revealed || answered ? 0 : 92 }}>{c.airport.name}</span>
              {revealed && (
                <span style={{ fontSize: 12, color: 'var(--color-accent-300)', animation: 'gcChip 0.35s ease' }}>
                  {c.airport.city_name}, {c.airport.country}
                </span>
              )}
            </button>
            {!revealed && !answered && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealCity(i);
                }}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 12,
                  font: 'inherit',
                  fontSize: 10.5,
                  cursor: 'pointer',
                  color: 'var(--color-accent)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 14,
                  padding: '4px 9px',
                  whiteSpace: 'nowrap',
                }}
              >
                Reveal city −{CITY_REVEAL_COST}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
