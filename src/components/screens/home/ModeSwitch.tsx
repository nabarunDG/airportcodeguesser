import type { Mode } from '../../../types';
import { ELITE_BONUS, maxScore } from '../../../lib/gameLogic';

interface Props {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
}

/** Three seats in a row — General Boarding. Same height as the flute. */
const SeatsIcon = (
  <svg width="22" height="15" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <rect x="1" y="5" width="6" height="9" rx="1.5" />
    <rect x="10" y="5" width="6" height="9" rx="1.5" />
    <rect x="19" y="5" width="6" height="9" rx="1.5" />
    <path d="M2 14v3M6 14v3M11 14v3M15 14v3M20 14v3M24 14v3" />
  </svg>
);

/** Champagne flute — tall narrow bowl, rising bubbles — Frequent Flyer. */
const FluteIcon = (
  <svg width="12" height="15" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 1h5v5.5a2.5 3.2 0 0 1-5 0Z" />
    <path d="M7 10.5v5.5" />
    <path d="M4 18.5h6" />
    <circle cx="6.1" cy="3.1" r="0.55" fill="currentColor" stroke="none" />
    <circle cx="8" cy="4.9" r="0.55" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="6.6" r="0.55" fill="currentColor" stroke="none" />
  </svg>
);

const HELPERS: Record<Mode, string> = {
  gb: `Friendlier skies: city names shown, more major airports, airline names included. Max ${maxScore('gb')} points.`,
  ff: `Smaller airports included. +${ELITE_BONUS} elite bonus, streaks count more. Max ${maxScore('ff')} points.`,
};

/** The Home screen's segmented GB/FF switch, with a helper line that swaps per selection. */
export default function ModeSwitch({ mode, onSetMode }: Props) {
  const segment = (m: Mode, icon: React.ReactNode, label: string) => {
    const active = mode === m;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onSetMode(m)}
        style={{
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 14px',
          borderRadius: 18,
          fontSize: 12.5,
          fontWeight: active ? 500 : 400,
          background: active ? 'var(--color-accent-900)' : 'transparent',
          border: `1px solid ${active ? 'var(--color-accent-600)' : 'transparent'}`,
          color: active ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div role="radiogroup" aria-label="Game mode" style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 22, padding: 3, gap: 3 }}>
        {segment('gb', SeatsIcon, 'General boarding')}
        {segment('ff', FluteIcon, 'Frequent flyer')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', maxWidth: 300, lineHeight: 1.45, textAlign: 'center' }}>
        {HELPERS[mode]}
      </div>
    </div>
  );
}
