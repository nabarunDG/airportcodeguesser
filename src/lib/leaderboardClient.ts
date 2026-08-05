// Leaderboard storage, behind a small interface so the localStorage stand-in
// used for the client-only milestone can be swapped for the real Cloudflare
// Functions + D1 backend later without touching any UI code (see the
// implementation plan's "order of implementation", step 8).
//
// Semantics (matches the design README's "Flight Leaders" section): one
// submission per fully-completed batch; aggregated per home airport over the
// current UTC ISO week (Monday–Sunday) — Score = sum of posted scores,
// Rounds = count of completed batches, PAX = distinct players, Avg =
// Score/Rounds to 1 decimal. Every submission is still stamped with its exact
// UTC day (unchanged), so a lightweight same-day "today" stat can be read off
// the same storage without any schema/shape change — see `TodayStats`.
import type { LbDir, LbSort, LeaderboardRow, TodayStats } from '../types';
import { addDaysUTC, todayUTC } from './gameLogic';

export interface ScoreSubmission {
  day: string; // UTC 'YYYY-MM-DD'
  airport: string;
  playerId: string;
  score: number;
  rounds: number; // always 1 today — one posted batch per submission
}

export interface LeaderboardParams {
  weekStart: string; // UTC 'YYYY-MM-DD', Monday — the aggregation window's inclusive start
  today: string; // UTC 'YYYY-MM-DD' — source date for the `today` stat
  sort: LbSort;
  dir: LbDir;
  playerId: string;
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export interface LeaderboardClient {
  submitScore(input: { airport: string; playerId: string; score: number }): Promise<SubmitResult>;
  getLeaderboard(params: LeaderboardParams): Promise<{ rows: LeaderboardRow[]; today: TodayStats }>;
}

const STORAGE_KEY = 'gatecheck_lb_submissions';
const MAX_STORED = 500;
const MAX_ROWS_RETURNED = 20;

function readAll(): ScoreSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: ScoreSubmission[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_STORED)));
  } catch {
    // localStorage unavailable/full — leaderboard posting silently no-ops, matching the prototype's trust model.
  }
}

/** localStorage-backed implementation — per-browser only, a stand-in until the D1-backed API ships. */
export const localLeaderboardClient: LeaderboardClient = {
  async submitScore({ airport, playerId, score }) {
    const rows = readAll();
    rows.push({ day: todayUTC(), airport, playerId, score, rounds: 1 });
    writeAll(rows);
    return { ok: true };
  },

  async getLeaderboard({ weekStart, today, sort, dir, playerId }) {
    const all = readAll();
    // 'YYYY-MM-DD' strings sort lexicographically = chronologically, so a
    // plain string range check is enough — no date parsing needed.
    const weekEnd = addDaysUTC(weekStart, 6);
    const rows = all.filter((r) => r.day >= weekStart && r.day <= weekEnd);
    const agg = new Map<string, { airport: string; score: number; rounds: number; players: Set<string> }>();
    for (const r of rows) {
      const g = agg.get(r.airport) ?? { airport: r.airport, score: 0, rounds: 0, players: new Set<string>() };
      g.score += r.score;
      g.rounds += r.rounds;
      g.players.add(r.playerId);
      agg.set(r.airport, g);
    }

    const avgOf = (g: { score: number; rounds: number }) => (g.rounds ? g.score / g.rounds : 0);
    const dirMul = dir === 'asc' ? -1 : 1;
    const list = [...agg.values()].sort(
      (x, y) => dirMul * (sort === 'avg' ? avgOf(y) - avgOf(x) : y.score - x.score),
    );

    const rowsOut: LeaderboardRow[] = list.slice(0, MAX_ROWS_RETURNED).map((g, i) => ({
      rank: i + 1,
      airport: g.airport,
      score: g.score,
      rounds: g.rounds,
      pax: g.players.size,
      avg: Math.round(avgOf(g) * 10) / 10,
      you: g.players.has(playerId),
    }));

    const todayRows = all.filter((r) => r.day === today);
    const todayStats: TodayStats = {
      pax: new Set(todayRows.map((r) => r.playerId)).size,
      points: todayRows.reduce((sum, r) => sum + r.score, 0),
    };

    return { rows: rowsOut, today: todayStats };
  },
};

/** Real backend — Cloudflare Pages Functions + D1 (see functions/api/*.ts and migrations/0001_init.sql). */
export const apiLeaderboardClient: LeaderboardClient = {
  async submitScore({ airport, playerId, score }) {
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ airport, playerId, score }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        return { ok: false, error: body.error ?? 'Could not post your score — try again.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error — could not post your score.' };
    }
  },

  async getLeaderboard({ weekStart, today, sort, dir, playerId }) {
    const empty = { rows: [] as LeaderboardRow[], today: { pax: 0, points: 0 } };
    try {
      const params = new URLSearchParams({ weekStart, date: today, sort, dir, playerId });
      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      if (!res.ok) return empty;
      const body = (await res.json()) as { rows?: LeaderboardRow[]; today?: TodayStats };
      return {
        rows: Array.isArray(body.rows) ? body.rows : [],
        today: body.today ?? empty.today,
      };
    } catch {
      return empty;
    }
  },
};

// `vite dev` serves the frontend only — there's no Functions backend behind
// it, so local iteration uses the localStorage stand-in (per the
// implementation plan: "npm run dev … needs no backend"). Production builds
// (and `npm run pages:dev`, which builds first) get the real API. Same
// interface either way — nothing else in the app branches on this.
export const defaultLeaderboardClient: LeaderboardClient = import.meta.env.DEV ? localLeaderboardClient : apiLeaderboardClient;
