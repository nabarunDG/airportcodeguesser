// Server-side sanity checks for a score submission. Deliberately not
// anti-cheat-hardened — same trust model as the design prototype's own
// localStorage leaderboard (a determined client can still fabricate a
// request). See the implementation plan's leaderboard section: acceptable
// for v1, revisit only if abuse is observed.
import { maxScore } from '../../src/lib/gameLogic';

// The real ceiling with every bonus banked (streak upgrades, continents, the
// date line, a long haul, FF's elite bonus) — derived from the same source
// the client's score gauge uses, not a separate number to keep in sync by
// hand. A batch used to cap at a flat 100 back when the only points were 10
// per round; that stale ceiling silently rejected every real submission
// above it once bonuses shipped; the client showed no error at all, since
// the summary itself already believes the (correct, higher) score.
const MAX_BATCH_SCORE = Math.max(maxScore('gb'), maxScore('ff'));

export interface ValidatedSubmission {
  airport: string;
  playerId: string;
  score: number;
}

export type ValidationResult = { ok: true; value: ValidatedSubmission } | { ok: false; error: string };

export function validateSubmission(body: unknown, validIata: ReadonlySet<string>): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { airport, playerId, score } = body as Record<string, unknown>;

  if (typeof airport !== 'string') {
    return { ok: false, error: "Missing airport code." };
  }
  const code = airport.toUpperCase().trim();
  if (code.length !== 3) {
    return { ok: false, error: 'Airport code must be 3 letters.' };
  }
  if (!validIata.has(code)) {
    return { ok: false, error: `${code} isn't a commercial airport we know — try your nearest one.` };
  }

  if (typeof playerId !== 'string' || !playerId.trim() || playerId.length > 64) {
    return { ok: false, error: 'Missing or invalid player id.' };
  }

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_BATCH_SCORE) {
    return { ok: false, error: `Score must be an integer between 0 and ${MAX_BATCH_SCORE}.` };
  }

  return { ok: true, value: { airport: code, playerId: playerId.trim(), score } };
}
