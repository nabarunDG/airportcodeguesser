-- Removes the homegrown usage-telemetry tables (0002_visits.sql,
-- 0003_batches.sql). That system — /api/ping, /api/batch, the daily
-- stats-snapshot GitHub Action — has been retired: it kept failing and
-- Cloudflare Pages' own analytics already cover traffic. The leaderboard's
-- score_submissions table (0001_init.sql) is untouched.
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS batches;
