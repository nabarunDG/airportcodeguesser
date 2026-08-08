import type { Choice, Mode } from '../../../types';
import { FF_CITY_HINT_COST } from '../../../lib/gameLogic';

interface Props {
  choices: Choice[];
  mode: Mode;
  answered: boolean;
  answeredIdx: number;
  revealedCities: number[];
  onPick: (idx: number) => void;
  onRevealCity: (idx: number) => void;
}

/**
 * The five options. General Boarding shows "City, Country" under every name
 * automatically; Frequent Flyer keeps the classic per-option city reveal at
 * −FF_CITY_HINT_COST, with the button sitting LEFT of the option so a right
 * thumb can reach both one-handed (design 1d).
 */
export default function ChoiceList({ choices, mode, answered, answeredIdx, revealedCities, onPick, onRevealCity }: Props) {
  const gb = mode === 'gb';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {choices.map((c, i) => {
        const isPicked = answeredIdx === i;
        const revealed = gb || revealedCities.includes(i);
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
        const hintSlot = !gb && !revealed && !answered;
        return (
          // The hint is a sibling, never overlaid on the answer button — the
          // two tap targets must not overlap (an earlier build spent a hint
          // where the player meant to answer).
          <div key={c.airport.iata} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
            {hintSlot && (
              <button
                onClick={() => onRevealCity(i)}
                aria-label={`City hint for ${c.airport.name}, costs ${FF_CITY_HINT_COST} point`}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  flex: 'none',
                  width: 72,
                  color: 'var(--color-neutral-400)',
                  background: 'transparent',
                  border: '1px solid var(--color-divider)',
                  borderRadius: 'var(--radius-md)',
                  padding: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                City hint
                <span style={{ display: 'block', fontSize: 9.5, color: 'var(--color-neutral-600)' }}>−{FF_CITY_HINT_COST}</span>
              </button>
            )}
            {/* Hold the gutter open on FF rows whose hint is already spent, so
                using one doesn't leave that option wider than its neighbours.
                Once answered every row drops the gutter together. */}
            {!gb && !hintSlot && !answered && <div aria-hidden="true" style={{ flex: 'none', width: 72 }} />}
            <button
              onClick={() => onPick(i)}
              style={{
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
                minHeight: 52,
                padding: revealed ? '9px 16px' : '12px 16px',
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
                <span
                  style={{
                    fontSize: 12,
                    color: gb ? 'var(--color-neutral-400)' : 'var(--color-accent-300)',
                    animation: gb ? undefined : 'gcChip 0.35s ease',
                  }}
                >
                  {c.airport.city_name}, {c.airport.country}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
