import { useEffect, useState } from 'react';
import type { Airport } from '../types';

export interface Weather {
  c: number;
  f: number;
}

/**
 * Fetches current temperature for a round's airport. Keyed on `airport.iata`
 * (a stable primitive) rather than the airport object, with an `active`
 * closure flag + AbortController guarding against a slow-resolving fetch
 * from a previous round painting onto the round that's current when it
 * finally resolves — the React-safe equivalent of the prototype's
 * `this.cur() === a` identity check. Fails silently (returns null) per the
 * design README: "hide temp if unavailable."
 */
export function useWeather(airport: Airport | undefined): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    setWeather(null);
    if (!airport) return;

    let active = true;
    const controller = new AbortController();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${airport.latitude}&longitude=${airport.longitude}&current=temperature_2m`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        const c = j?.current?.temperature_2m;
        if (active && typeof c === 'number') {
          setWeather({ c: Math.round(c), f: Math.round((c * 9) / 5 + 32) });
        }
      })
      .catch(() => {
        // Silent fail — no network, no rate limit — the chip just never appears.
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on iata (a stable primitive) by design, not the object
  }, [airport?.iata]);

  return weather;
}
