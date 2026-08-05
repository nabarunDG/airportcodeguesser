interface Props {
  homeInput: string;
  homeErr: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function HomeAirportForm({ homeInput, homeErr, onChange, onSubmit }: Props) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: 'min(400px, 100%)' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Add your airport — optional</label>
          <input
            className="input"
            value={homeInput}
            onChange={(e) => onChange(e.target.value)}
            maxLength={3}
            placeholder="e.g. JFK"
            style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', minHeight: 44 }}
          />
        </div>
        <button className="btn btn-primary" onClick={onSubmit} style={{ minHeight: 44 }}>
          Post score
        </button>
      </div>
      {homeErr && (
        <p style={{ width: 'min(400px, 100%)', fontSize: 12, color: 'var(--color-accent-300)', margin: '-12px 0 0', animation: 'gcChip 0.35s ease' }}>
          {homeErr}
        </p>
      )}
    </>
  );
}
