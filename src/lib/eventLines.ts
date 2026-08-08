// Oregon-Trail-style event lines, shown on ~40% of reveals (EVENT_LINE_CHANCE
// in gameLogic.ts): one random line from the positive pool on a correct
// answer, from the negative pool on a wrong/skip. Starter pools of 40 each
// supplied by the game owner (design handoff, event-lines.json). Deduped
// within a batch so a line never repeats on one journey.
import { EVENT_LINE_CHANCE, type Rng } from './gameLogic';

export const POSITIVE_EVENTS: readonly string[] = [
  'In-flight shower unlocked',
  'Lounge access pass',
  'Empty row behind you — stretch out',
  'Exit row legroom',
  'Private jet repositioning flight',
  'First class upgrade cleared',
  'Security line: 4 minutes flat',
  'Business class upgrade cleared',
  'Caviar service',
  'Champagne selection arrives',
  'The onboard bar is open',
  'BOGO neck pillows at the gate shop',
  'Fireworks visible from 30,000 ft',
  'Glorious sunset off the left wing',
  'Seat-switch request landed you a window',
  'Shockingly good airport coffee',
  'Mileage run successful',
  "Boarding first — you're in uniform",
  'Overhead bins still empty',
  'Flight arrived 20 minutes early',
  'Meal service is actually decent',
  'You got your first meal choice',
  'Chauffeur service to the airport',
  'Double-dip: card points + airline miles',
  'Incredible mileage redemption',
  'Cheap fare from the newsletter',
  'Water-cannon salute — inaugural flight',
  'Bulkhead row on the overnight',
  'Gate agent waves you through with a smile',
  'Your bag is first on the belt',
  'Seatmate offers you the armrest',
  'Wi-Fi is free today',
  'Captain points out the aurora',
  "Extra dessert 'because we had spares'",
  'TSA PreCheck lane is empty',
  'Crew slips you a full can',
  'Smooth-as-glass descent',
  'Jet bridge on arrival — no bus',
  'Your connection is at the next gate',
  'Pilot nails the landing; cabin applauds',
];

export const NEGATIVE_EVENTS: readonly string[] = [
  'Screaming infant in 14C',
  'Ground hold — 40 minutes',
  'Smelly lav two rows up',
  'Red-eye, zero sleep',
  'Passport expired — caught at the counter',
  'Turbulence: seatbelt sign all flight',
  'Your low-cost carrier just went bankrupt',
  'Bag-handler strike',
  'Crew and pilot timed out',
  'Unscheduled refueling stop',
  'Wing de-icing queue',
  'Bag fees just increased',
  'Chatty neighbor, all 9 hours',
  "Someone's crop dusting the cabin",
  'Baggage arrived damaged',
  'Fire alarm — someone vaped in the lav',
  'No more blankets',
  'Seat-back screen is dead',
  'Headphones lost in the seat',
  'Greasy window',
  "Seat won't recline",
  'Air vent broken',
  'You forgot to pack your meds',
  'Middle seat between two armrest hogs',
  'Gate change to the far terminal',
  'Boarding group 9 of 9',
  'Overhead bins full at your row',
  'Pretzels — only pretzels',
  'Wi-Fi paid for, never connected',
  "Seat pocket has someone's gum",
  'Deplaning by stairs in the rain',
  'Your checked bag went to the wrong hub',
  'Paged at the gate: flight oversold',
  "Tray table won't latch",
  'Kid behind you discovers seat-kicking',
  'Announcement volume: jet engine',
  'Duty-free cart blocks the aisle',
  'Customs line wraps twice',
  'Jet lag hits at baggage claim',
  "Carousel spins, your bag doesn't",
];

/**
 * Rolls the ~40% gate and, when it fires, picks a line from the right pool
 * that hasn't been used this batch. `used` is mutated with the pick. Returns
 * null when the gate doesn't fire or the pool has run dry (both pools are 40
 * deep, so a 10-round batch can't realistically exhaust one).
 */
export function rollEventLine(kind: 'positive' | 'negative', used: Set<string>, rng: Rng = Math.random): string | null {
  if (rng() >= EVENT_LINE_CHANCE) return null;
  const pool = (kind === 'positive' ? POSITIVE_EVENTS : NEGATIVE_EVENTS).filter((l) => !used.has(l));
  if (pool.length === 0) return null;
  const line = pool[Math.floor(rng() * pool.length)];
  used.add(line);
  return line;
}
