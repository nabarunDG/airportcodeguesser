-- One row per finished 10-round batch — anonymous, aggregate-only gameplay
-- telemetry alongside `visits` (0002). Written by functions/api/batch.ts on
-- batch completion regardless of whether the player posts a leaderboard
-- score. player_id is the same anonymous localStorage id as everywhere else;
-- `day` is stamped server-side. Internal-stats only, not surfaced in the app;
-- query directly, e.g.:
--   SELECT day, COUNT(*) AS batches, AVG(duration_seconds) AS avg_secs,
--          AVG(score) AS avg_score
--   FROM batches GROUP BY day ORDER BY day DESC;
CREATE TABLE batches (
  day TEXT NOT NULL,
  player_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  hints_used INTEGER NOT NULL,
  stamps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_batches_day ON batches (day);
