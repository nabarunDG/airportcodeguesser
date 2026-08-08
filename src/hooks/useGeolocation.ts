import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

export interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lon: number } | null;
  request: () => void;
}

const TIMEOUT_MS = 8000;

/**
 * Precise device location, read only when `request()` is called.
 *
 * Deliberately never fires on mount: a permission prompt on page load is the
 * pattern users are most primed to refuse, and browsers increasingly penalise
 * it. Asking on a tap — next to a button that says what it's for — is both
 * the recommended practice and the version people actually accept.
 *
 * Every failure resolves to a status rather than an exception, because this
 * is an optional convenience: Safari, Brave and Firefox privacy settings, an
 * insecure origin, or a plain refusal must all leave check-in usable.
 */
export function useGeolocation(): GeoState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!live.current) return;
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus('ready');
      },
      (err) => {
        if (!live.current) return;
        // PERMISSION_DENIED is the only one worth naming differently — the
        // rest (position unavailable, timeout) are all "we couldn't, move on".
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { timeout: TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  return { status, coords, request };
}
