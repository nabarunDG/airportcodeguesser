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

export interface ValidatedPing {
  playerId: string;
  seconds: number;
}

// A ping only ever reports elapsed wall-clock time since the last ping from
// the same tab (see src/lib/metrics.ts) — one minute apart at most in
// practice, so a generous 1-hour cap is purely a sanity bound against a
// malformed or replayed request, not a real usage ceiling.
const MAX_PING_SECONDS = 3600;

export function validatePing(body: unknown): { ok: true; value: ValidatedPing } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { playerId, seconds } = body as Record<string, unknown>;

  if (typeof playerId !== 'string' || !playerId.trim() || playerId.length > 64) {
    return { ok: false, error: 'Missing or invalid player id.' };
  }

  const secs =
    typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.min(MAX_PING_SECONDS, Math.round(seconds))) : 0;

  return { ok: true, value: { playerId: playerId.trim(), seconds: secs } };
}

export interface ValidatedBatchMetric {
  playerId: string;
  durationSeconds: number;
  score: number;
  correct: number;
  hintsUsed: number;
  stamps: number;
}

// A batch is 10 rounds with no countdown, only a 150s-per-round idle skip, so
// ~25 minutes is the practical ceiling; 6 hours is a loose sanity bound
// against a malformed request (e.g. a tab left open across a suspend).
const MAX_BATCH_SECONDS = 21_600;
// Hints are capped per round (3 boolean hints + up to 4 city reveals), so 70
// is the real per-batch ceiling — rounded up as a sanity bound.
const MAX_HINTS_USED = 100;

/**
 * Bounds-checks one gameplay telemetry row. Unlike a score submission, a bad
 * value here is clamped rather than rejected where it's harmless to do so —
 * this is a fire-and-forget beacon, and losing the row entirely over one
 * out-of-range field would bias the stats more than clamping does. Only a
 * missing/invalid playerId is fatal, since the row is meaningless without it.
 */
export function validateBatchMetric(body: unknown): { ok: true; value: ValidatedBatchMetric } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { playerId, durationSeconds, score, correct, hintsUsed, stamps } = body as Record<string, unknown>;

  if (typeof playerId !== 'string' || !playerId.trim() || playerId.length > 64) {
    return { ok: false, error: 'Missing or invalid player id.' };
  }

  const clamp = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;

  return {
    ok: true,
    value: {
      playerId: playerId.trim(),
      durationSeconds: clamp(durationSeconds, MAX_BATCH_SECONDS),
      score: clamp(score, MAX_BATCH_SCORE),
      correct: clamp(correct, 10),
      hintsUsed: clamp(hintsUsed, MAX_HINTS_USED),
      stamps: clamp(stamps, 10),
    },
  };
}
