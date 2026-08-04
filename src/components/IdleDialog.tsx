interface Props {
  onDismiss: () => void;
}

/** "Still there?" nudge at 120s idle — see design README's timeout rules. */
export default function IdleDialog({ onDismiss }: Props) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 40 }}>
      <div className="dialog">
        <span className="dialog-title">Still there?</span>
        <p className="dialog-body">No rush — but this round will taxi away in 30 seconds if nobody's aboard.</p>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onDismiss} style={{ minHeight: 44 }}>
            I'm here
          </button>
        </div>
      </div>
    </div>
  );
}
