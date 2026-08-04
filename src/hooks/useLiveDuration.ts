import { useEffect, useState } from 'react';
import { fmtDur } from '../lib/gameLogic';

/** Ticks every second, formatting elapsed time since `startMs` (e.g. "4m 32s"). Purely presentational. */
export function useLiveDuration(startMs: number | null): string {
  const [label, setLabel] = useState('—');

  useEffect(() => {
    if (startMs == null) {
      setLabel('—');
      return;
    }
    const format = () => setLabel(fmtDur(Math.floor((Date.now() - startMs) / 1000)));
    format();
    const id = setInterval(format, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  return label;
}
