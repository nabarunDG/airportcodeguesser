-- One row per posted (fully-completed) batch. Aggregation — SUM/COUNT
-- DISTINCT/AVG per UTC day per airport — happens at read time in
-- functions/api/leaderboard.ts, not here. See src/lib/leaderboardClient.ts
-- for the client-side semantics this mirrors.
CREATE TABLE score_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                 -- UTC date 'YYYY-MM-DD', stamped server-side — never trust the client's clock
  airport TEXT NOT NULL,             -- 3-letter IATA, uppercase
  player_id TEXT NOT NULL,           -- anonymous client id (see src/lib/playerId.ts)
  score INTEGER NOT NULL,            -- 0-100, validated server-side
  rounds INTEGER NOT NULL DEFAULT 1, -- always 1 today (one completed batch per row)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_score_day_airport ON score_submissions (day, airport);
CREATE INDEX idx_score_day_player ON score_submissions (day, player_id);
