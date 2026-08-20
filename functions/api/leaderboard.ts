// GET /api/leaderboard?weekStart=YYYY-MM-DD&lastWeekStart=YYYY-MM-DD&sort=total|avg&dir=desc|asc&playerId=...
// Runs one of four precompiled GROUP BY queries (see functions/lib/sql.ts) —
// `sort`/`dir` are validated against a fixed enum before ever touching the
// query lookup, so there's no free-form ORDER BY built from request input.
// `weekStart` (a Monday) drives the main ranked table; `lastWeekStart` (the
// prior Monday) drives the "last week's winners" line — the same two
// precompiled queries (total_desc, avg_desc), just bound to a different
// window and read for their top row only.
import type { PagesFunction } from '@cloudflare/workers-types';
import type { LbDir, LbSort, LeaderboardRow, WeekWinners } from '../../src/types';
import { LEADERBOARD_QUERIES, YOUR_AIRPORTS_QUERY } from '../lib/sql';
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

const VALID_SORTS: readonly LbSort[] = ['total', 'avg'];
const VALID_DIRS: readonly LbDir[] = ['asc', 'desc'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get('weekStart') ?? '';
  const lastWeekStart = url.searchParams.get('lastWeekStart') ?? '';
  const sortParam = url.searchParams.get('sort') ?? 'total';
  const dirParam = url.searchParams.get('dir') ?? 'desc';
  const playerId = url.searchParams.get('playerId') ?? '';

  if (!DATE_RE.test(weekStart) || !DATE_RE.test(lastWeekStart)) {
    return jsonResponse({ ok: false, error: 'Invalid or missing weekStart/lastWeekStart (expected YYYY-MM-DD).' }, 400);
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

  const [{ results: topTotalRows }, { results: topAvgRows }] = await Promise.all([
    env.DB.prepare(LEADERBOARD_QUERIES.total_desc).bind(lastWeekStart).all<LeaderboardRowFromDb>(),
    env.DB.prepare(LEADERBOARD_QUERIES.avg_desc).bind(lastWeekStart).all<LeaderboardRowFromDb>(),
  ]);
  const winners: WeekWinners = {
    topTotal: topTotalRows[0] ? { airport: topTotalRows[0].airport, score: topTotalRows[0].score } : null,
    topAvg: topAvgRows[0] ? { airport: topAvgRows[0].airport, avg: topAvgRows[0].avg } : null,
  };

  return jsonResponse({ weekStart, rows, winners }, 200);
};
