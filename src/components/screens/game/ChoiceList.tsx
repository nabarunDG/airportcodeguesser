import type { Choice } from '../../../types';

interface Props {
  choices: Choice[];
  answered: boolean;
  answeredIdx: number;
  showCities: boolean;
  onPick: (idx: number) => void;
}

export default function ChoiceList({ choices, answered, answeredIdx, showCities, onPick }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {choices.map((c, i) => {
        const isPicked = answeredIdx === i;
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
          <button
            key={c.airport.iata}
            onClick={() => onPick(i)}
            style={{
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
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
            <span style={{ fontSize: 15 }}>{c.airport.name}</span>
            {showCities && (
              <span style={{ fontSize: 12, color: 'var(--color-accent-300)', animation: 'gcChip 0.35s ease' }}>
                {c.airport.city_name}, {c.airport.country}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
