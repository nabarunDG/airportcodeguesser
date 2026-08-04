import { useCallback, useEffect, useState } from 'react';
import { buildIndex, loadAirports, resetAirportsCache } from './lib/dataset';
import type { Airport } from './types';
import GameApp from './GameApp';
import BootScreen from './components/BootScreen';

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; airports: Airport[]; byCode: Record<string, Airport> }
  | { status: 'error'; message: string };

// Data loading lives here, outside the game engine entirely (see decision 5
// in the implementation plan): the trimmed dataset is prefetched at module
// load (src/lib/dataset.ts), so this almost always resolves before a player
// even finishes reading the Home screen. BootScreen only ever becomes
// visible on a slow connection or a genuinely broken/corrupted asset — it is
// not part of the normal "Start boarding" flow.
export default function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  const attemptLoad = useCallback(() => {
    loadAirports()
      .then((airports) => {
        setBoot({ status: 'ready', airports, byCode: buildIndex(airports) });
      })
      .catch((err: unknown) => {
        setBoot({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  useEffect(() => {
    attemptLoad();
  }, [attemptLoad]);

  const retry = useCallback(() => {
    resetAirportsCache();
    setBoot({ status: 'loading' });
    attemptLoad();
  }, [attemptLoad]);

  if (boot.status !== 'ready') {
    return <BootScreen status={boot.status} message={boot.status === 'error' ? boot.message : undefined} onRetry={retry} />;
  }

  return <GameApp airports={boot.airports} byCode={boot.byCode} />;
}
