-- Anonymous, aggregate-only usage telemetry — no third-party analytics.
-- One row per (day, player_id); `seconds` accumulates across pings from
-- that browser during that UTC day. player_id is the same anonymous,
-- localStorage-persisted id used for the leaderboard (src/lib/playerId.ts)
-- — never tied to a real identity. Internal-stats only, not surfaced in
-- the app; query directly (Cloudflare dashboard D1 console, or
-- `wrangler d1 execute --remote`), e.g.:
--   SELECT day, COUNT(DISTINCT player_id) AS unique_users, SUM(seconds) AS total_seconds
--   FROM visits GROUP BY day ORDER BY day DESC;
CREATE TABLE visits (
  day TEXT NOT NULL,
  player_id TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, player_id)
);
