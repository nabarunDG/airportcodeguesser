interface Props {
  iata: string;
}

export default function CodeTiles({ iata }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {iata.split('').map((ltr, i) => (
        <div
          key={i}
          style={{
            width: 64,
            height: 82,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 46,
            fontWeight: 500,
            color: 'var(--color-text)',
          }}
        >
          {ltr}
        </div>
      ))}
    </div>
  );
}
