// Server-side sanity checks for a score submission. Deliberately not
// anti-cheat-hardened — same trust model as the design prototype's own
// localStorage leaderboard (a determined client can still fabricate a
// request). See the implementation plan's leaderboard section: acceptable
// for v1, revisit only if abuse is observed.

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

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
    return { ok: false, error: 'Score must be an integer between 0 and 100.' };
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
