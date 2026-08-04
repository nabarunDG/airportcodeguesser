// POST /api/score — records one completed batch. Body: { airport, playerId, score }.
// The `day` column is stamped server-side (see INSERT_SCORE_QUERY) — the
// client's clock is never trusted for leaderboard-day bucketing.
import type { PagesFunction } from '@cloudflare/workers-types';
import airportsData from '../../public/airports.json';
import type { Airport } from '../../src/types';
import { validateSubmission } from '../lib/validate';
import { INSERT_SCORE_QUERY } from '../lib/sql';
import { jsonResponse } from '../lib/http';

interface Env {
  DB: D1Database;
}

// Validation set built from the FULL trimmed dataset (not the narrower
// ≥8-route gameplay-eligible set) — a legitimate home airport need not be
// big enough to ever appear as a guessable answer. See gameLogic.ts.
const VALID_IATA = new Set((airportsData as Airport[]).map((a) => a.iata));

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const result = validateSubmission(body, VALID_IATA);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400);
  }

  const { airport, playerId, score } = result.value;
  await env.DB.prepare(INSERT_SCORE_QUERY).bind(airport, playerId, score).run();

  return jsonResponse({ ok: true }, 200);
};
