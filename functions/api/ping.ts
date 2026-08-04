// POST /api/ping — anonymous, aggregate-only usage telemetry. Body:
// { playerId, seconds }. No third-party analytics involved: this is a
// first-party endpoint writing to our own D1 database (see
// migrations/0002_visits.sql). Not surfaced anywhere in the app — query
// directly via the Cloudflare dashboard's D1 console or `wrangler d1
// execute --remote` when you want a number.
import type { PagesFunction } from '@cloudflare/workers-types';
import { validatePing } from '../lib/validate';
import { UPSERT_VISIT_QUERY } from '../lib/sql';
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

  const result = validatePing(body);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400);
  }

  const { playerId, seconds } = result.value;
  await env.DB.prepare(UPSERT_VISIT_QUERY).bind(playerId, seconds).run();

  return jsonResponse({ ok: true }, 200);
};
