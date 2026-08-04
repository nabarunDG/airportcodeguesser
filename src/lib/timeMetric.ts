// Time-on-page is tracked purely as a marketing metric (see design README):
// accumulate seconds-per-batch into persistent storage. Not shown in the UI.
const KEY = 'gatecheck_time_seconds';

export function accumulateTime(seconds: number): void {
  if (seconds <= 0) return;
  try {
    const total = Number(localStorage.getItem(KEY) || '0');
    localStorage.setItem(KEY, String(total + seconds));
  } catch {
    // ignore — non-critical metric
  }
}
