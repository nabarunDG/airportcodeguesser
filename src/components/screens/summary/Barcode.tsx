import type { BarcodeBar } from '../../../lib/gameLogic';

interface Props {
  bars: BarcodeBar[];
}

export default function Barcode({ bars }: Props) {
  return (
    <div style={{ height: 34, display: 'flex', alignItems: 'stretch', opacity: 0.7, overflow: 'hidden' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 'none', width: b.w, marginRight: b.g, background: 'var(--color-neutral-300)' }} />
      ))}
    </div>
  );
}
