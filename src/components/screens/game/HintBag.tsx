import type { HintKey } from '../../../types';
import { HINT_COST } from '../../../lib/gameLogic';
import './HintBag.css';

interface Props {
  hints: { sorted: boolean; names: boolean; cities: boolean; country: boolean };
  disabled: boolean;
  onUse: (key: HintKey) => void;
}

const HINT_DEFS: { key: HintKey; label: string }[] = [
  { key: 'sorted', label: 'Sort routes by traffic' },
  { key: 'names', label: 'Airline names' },
  { key: 'cities', label: 'Show cities' },
  { key: 'country', label: 'Reveal country' },
];

export default function HintBag({ hints, disabled, onUse }: Props) {
  return (
    <div className="gc-hintbag">
      <div className="gc-hintbag-zip" />
      <div className="gc-hintbag-body">
        <div className="gc-hintbag-header">
          <span className="gc-hintbag-title">HINT BAG</span>
          <span className="gc-hintbag-note">3.4 oz / 100 ml max · −{HINT_COST} pts each</span>
        </div>
        <div className="gc-hintbag-chips">
          {HINT_DEFS.map((h) => {
            const done = hints[h.key];
            return (
              <button
                key={h.key}
                className={`gc-hint-chip ${done ? 'gc-hint-chip--done' : ''}`}
                disabled={done || disabled}
                onClick={() => onUse(h.key)}
              >
                {done ? `${h.label} ✓` : `${h.label}  −${HINT_COST}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
