import { useEffect, useState } from 'react';

/** Ticks every second, formatting the current time in `timezone`. Purely presentational. */
export function useLocalClock(timezone: string | undefined): string {
  const [clock, setClock] = useState('—:—');

  useEffect(() => {
    if (!timezone) {
      setClock('—:—');
      return;
    }
    const format = () => {
      try {
        setClock(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date()));
      } catch {
        setClock('—:—');
      }
    };
    format();
    const id = setInterval(format, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  return clock;
}
