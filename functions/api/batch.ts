// POST /api/batch — anonymous gameplay telemetry for one finished batch.
// Body: { playerId, durationSeconds, score, correct, hintsUsed, stamps }.
// Sibling of /api/ping (visit time); both are first-party writes to our own
// D1 database, no third-party analytics. Fired on batch completion whether or
// not the player posts a leaderboard score, so these rows cover every played
// batch rather than only submitted ones. `day` is stamped server-side — the
// client's clock is never trusted for day bucketing. Not surfaced in the app;
// query directly (see migrations/0003_batches.sql).
import type { PagesFunction } from '@cloudflare/workers-types';
import { validateBatchMetric } from '../lib/validate';
import { INSERT_BATCH_QUERY } from '../lib/sql';
import { jsonResponse } from '../lib/http';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const result = validateBatchMetric(body);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400);
  }

  const { playerId, durationSeconds, score, correct, hintsUsed, stamps } = result.value;
  await env.DB.prepare(INSERT_BATCH_QUERY).bind(playerId, durationSeconds, score, correct, hintsUsed, stamps).run();

  return jsonResponse({ ok: true }, 200);
};
