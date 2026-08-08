import { useEffect, useState } from 'react';
import { loadCityIndex } from '../lib/dataset';

/**
 * The city→airport map for towns with no airport of their own. Starts empty
 * and fills in when the (module-cached, warmed-at-load) fetch resolves, so
 * check-in falls back to airport-name matching rather than waiting on it.
 */
export function useCityIndex(): Record<string, string> {
  const [index, setIndex] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void loadCityIndex().then((loaded) => {
      if (live) setIndex(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  return index;
}
