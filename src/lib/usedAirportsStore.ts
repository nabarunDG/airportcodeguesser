// Persists the set of airports already shown today, scoped to the UTC
// calendar day, so a page reload (or closing and reopening the browser)
// doesn't repeat an airport the player already saw earlier today. Plain
// same-origin localStorage — never transmitted anywhere, not a cookie, not
// tied to any identity. Resets itself automatically once the stored date no
// longer matches today's UTC date; the in-session ≥80-remaining reuse floor
// in gameLogic.ts's buildBatch() still applies on top of this.
import { todayUTC } from './gameLogic';

const KEY = 'gatecheck_used_today';

interface StoredUsed {
  date: string;
  used: string[];
}

export function loadUsedToday(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as StoredUsed;
    if (parsed.date !== todayUTC() || !Array.isArray(parsed.used)) return new Set();
    return new Set(parsed.used);
  } catch {
    return new Set();
  }
}

export function saveUsedToday(used: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: todayUTC(), used: [...used] }));
  } catch {
    // localStorage unavailable/full — falls back to in-memory-only for this session
  }
}
