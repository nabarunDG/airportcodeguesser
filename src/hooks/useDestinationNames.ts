import { useEffect, useState } from 'react';
import { loadDestinationNames } from '../lib/dataset';

/**
 * Cities for route destinations too small to be airports in their own right.
 * Starts empty and fills in when the (module-cached, warmed-at-load) fetch
 * resolves, so the destination-names hint degrades to bare codes rather than
 * blocking on it. Kept out of useGameEngine because nothing about it affects
 * gameplay — see the note at the top of that file.
 */
export function useDestinationNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void loadDestinationNames().then((loaded) => {
      if (live) setNames(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  return names;
}
