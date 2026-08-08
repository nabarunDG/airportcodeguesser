interface Props {
  onDismiss: () => void;
}

/**
 * Bottom-anchored toast at ~45s idle with zero clues pulled this round —
 * beta testers didn't realize the clue pills were free. Dismissed by any
 * interaction (the engine's act() clears it); the button here is just an
 * explicit way to do the same. Distinct from the 120s taxi-away dialog.
 */
export default function ClueNudgeToast({ onDismiss }: Props) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 14,
        width: 'min(560px, calc(100% - 40px))',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-accent-800)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 30,
        animation: 'gcChip 0.35s ease',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3v2M5.6 5.6 7 7M3 12h2M19 12h2M17 7l1.4-1.4" />
        <path d="M8 17a4 4 0 1 1 8 0" />
        <path d="M4 21h16" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', flex: 1 }}>
        Psst — airlines, destinations, and country are free clues. They help!
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: 'pointer',
          color: 'var(--color-neutral-600)',
          background: 'transparent',
          border: 0,
          padding: '4px 6px',
        }}
      >
        ✕
      </button>
    </div>
  );
}
