// GET /api/leaderboard?weekStart=YYYY-MM-DD&date=YYYY-MM-DD&sort=total|avg&dir=desc|asc&playerId=...
// Runs one of four precompiled GROUP BY queries (see functions/lib/sql.ts) —
// `sort`/`dir` are validated against a fixed enum before ever touching the
// query lookup, so there's no free-form ORDER BY built from request input.
// `weekStart` (a Monday) drives the main ranked table; `date` (today) drives
// the separate, ungrouped "today" activity stat — two different windows over
// the same table, see functions/lib/sql.ts's header comment.
import type { PagesFunction } from '@cloudflare/workers-types';
import type { LbDir, LbSort, LeaderboardRow, TodayStats } from '../../src/types';
import { LEADERBOARD_QUERIES, TODAY_STATS_QUERY, YOUR_AIRPORTS_QUERY } from '../lib/sql';
import { jsonResponse } from '../lib/http';

interface Env {
  DB: D1Database;
}

interface LeaderboardRowFromDb {
  airport: string;
  score: number;
  rounds: number;
  pax: number;
  avg: number;
}

interface TodayStatsFromDb {
  points: number | null;
  pax: number | null;
}

const VALID_SORTS: readonly LbSort[] = ['total', 'avg'];
const VALID_DIRS: readonly LbDir[] = ['asc', 'desc'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get('weekStart') ?? '';
  const date = url.searchParams.get('date') ?? '';
  const sortParam = url.searchParams.get('sort') ?? 'total';
  const dirParam = url.searchParams.get('dir') ?? 'desc';
  const playerId = url.searchParams.get('playerId') ?? '';

  if (!DATE_RE.test(weekStart) || !DATE_RE.test(date)) {
    return jsonResponse({ ok: false, error: 'Invalid or missing weekStart/date (expected YYYY-MM-DD).' }, 400);
  }
  const sort: LbSort = VALID_SORTS.includes(sortParam as LbSort) ? (sortParam as LbSort) : 'total';
  const dir: LbDir = VALID_DIRS.includes(dirParam as LbDir) ? (dirParam as LbDir) : 'desc';

  const query = LEADERBOARD_QUERIES[`${sort}_${dir}`];
  const { results } = await env.DB.prepare(query).bind(weekStart).all<LeaderboardRowFromDb>();

  let yourAirports = new Set<string>();
  if (playerId) {
    const { results: yours } = await env.DB
      .prepare(YOUR_AIRPORTS_QUERY)
      .bind(weekStart, playerId)
      .all<{ airport: string }>();
    yourAirports = new Set(yours.map((r) => r.airport));
  }

  const rows: LeaderboardRow[] = results.map((r, i) => ({
    rank: i + 1,
    airport: r.airport,
    score: r.score,
    rounds: r.rounds,
    pax: r.pax,
    avg: r.avg,
    you: yourAirports.has(r.airport),
  }));

  const todayRow = await env.DB.prepare(TODAY_STATS_QUERY).bind(date).first<TodayStatsFromDb>();
  const today: TodayStats = { points: todayRow?.points ?? 0, pax: todayRow?.pax ?? 0 };

  return jsonResponse({ weekStart, rows, today }, 200);
};
