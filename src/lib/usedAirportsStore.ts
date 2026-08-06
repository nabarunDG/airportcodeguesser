// Persists which airports the player has already seen (as answers OR
// distractors) and which countries they've already "stamped", keyed by UTC
// calendar day, so a page reload doesn't repeat what the player just saw.
// Plain same-origin localStorage — never transmitted anywhere, not a cookie,
// not tied to any identity.
//
// Airports are remembered for USED_RETENTION_DAYS (a short cooldown across
// consecutive days, not just within one); passport stamps reset daily — a
// country stamped yesterday is stampable again today. Entries older than the
// retention window are pruned on load; the in-session ≥80-remaining reuse
// floor in gameLogic.ts's buildBatch() still applies on top of this.
import { addDaysUTC, todayUTC } from './gameLogic';

const KEY = 'gatecheck_used_today';

export const USED_RETENTION_DAYS = 3;

interface DayEntry {
  airports: string[];
  countries: string[];
}

type DayMap = Record<string, DayEntry>;

// The loaded day-map is kept module-local so saveUsedToday() can write only
// today's *new* airports (the union it receives minus what earlier retained
// days already hold) — otherwise every save would fold the older days into
// today's entry and the retention window would never actually expire.
let dayMap: DayMap | null = null;

function isDayEntry(v: unknown): v is DayEntry {
  return (
    typeof v === 'object' && v !== null && Array.isArray((v as DayEntry).airports) && Array.isArray((v as DayEntry).countries)
  );
}

function loadMap(): DayMap {
  if (dayMap) return dayMap;
  let map: DayMap = {};
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === 'object' && parsed !== null) {
      const days = (parsed as { days?: unknown }).days;
      if (typeof days === 'object' && days !== null) {
        for (const [day, entry] of Object.entries(days as Record<string, unknown>)) {
          if (isDayEntry(entry)) map[day] = entry;
        }
      } else {
        // Pre-retention format: { date, used } — carry the day over as-is.
        const { date, used } = parsed as { date?: unknown; used?: unknown };
        if (typeof date === 'string' && Array.isArray(used)) {
          map[date] = { airports: used.filter((u): u is string => typeof u === 'string'), countries: [] };
        }
      }
    }
  } catch {
    map = {};
  }
  const oldest = addDaysUTC(todayUTC(), -(USED_RETENTION_DAYS - 1));
  for (const day of Object.keys(map)) {
    if (day < oldest) delete map[day];
  }
  dayMap = map;
  return map;
}

function persist(map: DayMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ days: map }));
  } catch {
    // localStorage unavailable/full — falls back to in-memory-only for this session
  }
}

/** Airports seen in the last USED_RETENTION_DAYS days (today included). */
export function loadUsedToday(): Set<string> {
  const map = loadMap();
  const union = new Set<string>();
  for (const entry of Object.values(map)) {
    for (const iata of entry.airports) union.add(iata);
  }
  return union;
}

/** Countries already passport-stamped today (stamps reset daily). */
export function loadStampedToday(): Set<string> {
  return new Set(loadMap()[todayUTC()]?.countries ?? []);
}

/** Records the current used-set (a union across retained days) under today's entry. */
export function saveUsedToday(used: Set<string>): void {
  const map = loadMap();
  const today = todayUTC();
  const priorDays = new Set<string>();
  for (const [day, entry] of Object.entries(map)) {
    if (day !== today) for (const iata of entry.airports) priorDays.add(iata);
  }
  map[today] = {
    airports: [...used].filter((iata) => !priorDays.has(iata)),
    countries: map[today]?.countries ?? [],
  };
  persist(map);
}

/** Records today's stamped countries. */
export function saveStampedToday(countries: Set<string>): void {
  const map = loadMap();
  const today = todayUTC();
  map[today] = { airports: map[today]?.airports ?? [], countries: [...countries] };
  persist(map);
}
