// Anonymous, aggregate-only usage telemetry — first-party only (posts to
// our own /api/ping Function, see functions/api/ping.ts), no third-party
// analytics script, no PII. Reuses the same anonymous, localStorage-backed
// playerId as the leaderboard. Not displayed anywhere in the app; query the
// `visits` table directly when you want a number.
import { getPlayerId } from './playerId';

const PING_ENDPOINT = '/api/ping';
const PING_INTERVAL_MS = 60_000;

function sendPing(seconds: number): void {
  const payload = JSON.stringify({ playerId: getPlayerId(), seconds });
  // sendBeacon survives page unload (the case fetch would otherwise miss);
  // fall back to a keepalive fetch on the rare browser without it.
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(PING_ENDPOINT, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(PING_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(
      () => {},
    );
  }
}

/**
 * Starts reporting elapsed active time in ~60s increments, plus an
 * immediate flush whenever the tab is hidden or the page is being torn
 * down (so a short visit still registers rather than being lost between
 * interval ticks). Returns a stop function that flushes one last time and
 * tears down its listeners. No-op during `vite dev` (there's no Functions
 * backend behind it — see src/lib/leaderboardClient.ts for the same split).
 */
export function startMetricsPing(): () => void {
  if (import.meta.env.DEV) return () => {};

  let lastPingAt = Date.now();
  const flush = () => {
    const now = Date.now();
    const elapsed = Math.round((now - lastPingAt) / 1000);
    lastPingAt = now;
    sendPing(elapsed);
  };

  // Register presence immediately, even if the visit ends before the first interval tick.
  sendPing(0);

  const intervalId = window.setInterval(flush, PING_INTERVAL_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flush);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
