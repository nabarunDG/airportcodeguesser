// Precompiled leaderboard queries — one per (sort, dir) combination. Fixed,
// literal SQL strings, never built from request input, so there's no
// free-form ORDER BY / injection surface even though `sort`/`dir` come from
// the query string (see functions/api/leaderboard.ts for how the enum lookup
// is validated before this module is even consulted).
//
// Aggregation window is a UTC ISO week (Monday–Sunday), not a single day —
// ?1 is the week's Monday, bound once; `date(?1, '+6 days')` derives Sunday
// in SQL rather than requiring a second client-computed bound. The same
// queries, bound to the *previous* Monday, also serve the "last week's
// winners" line — see functions/api/leaderboard.ts.
import type { LbDir, LbSort } from '../../src/types';

const SELECT = `
  SELECT airport,
         SUM(score) AS score,
         SUM(rounds) AS rounds,
         COUNT(DISTINCT player_id) AS pax,
         ROUND(CAST(SUM(score) AS REAL) / SUM(rounds), 1) AS avg
  FROM score_submissions
  WHERE day BETWEEN ?1 AND date(?1, '+6 days')
  GROUP BY airport
`;

export const LEADERBOARD_QUERIES: Record<`${LbSort}_${LbDir}`, string> = {
  total_desc: `${SELECT} ORDER BY score DESC LIMIT 20`,
  total_asc: `${SELECT} ORDER BY score ASC LIMIT 20`,
  avg_desc: `${SELECT} ORDER BY avg DESC LIMIT 20`,
  avg_asc: `${SELECT} ORDER BY avg ASC LIMIT 20`,
};

export const YOUR_AIRPORTS_QUERY = `
  SELECT DISTINCT airport FROM score_submissions
  WHERE day BETWEEN ?1 AND date(?1, '+6 days') AND player_id = ?2
`;

export const INSERT_SCORE_QUERY = `
  INSERT INTO score_submissions (day, airport, player_id, score, rounds)
  VALUES (strftime('%Y-%m-%d', 'now'), ?1, ?2, ?3, 1)
`;

// One row per finished batch (see migrations/0003_batches.sql) — gameplay
// telemetry, recorded whether or not the player posts a leaderboard score.
export const INSERT_BATCH_QUERY = `
  INSERT INTO batches (day, player_id, duration_seconds, score, correct, hints_used, stamps)
  VALUES (strftime('%Y-%m-%d', 'now'), ?1, ?2, ?3, ?4, ?5, ?6)
`;

// One row per (day, player_id) — repeated pings from the same browser during
// the same UTC day accumulate onto the same row rather than creating new
// ones, so COUNT(DISTINCT player_id) stays an accurate unique-visitor count.
export const UPSERT_VISIT_QUERY = `
  INSERT INTO visits (day, player_id, seconds)
  VALUES (strftime('%Y-%m-%d', 'now'), ?1, ?2)
  ON CONFLICT (day, player_id) DO UPDATE SET
    seconds = seconds + excluded.seconds,
    updated_at = datetime('now')
`;
