// The ported prototype `Component` class, as a React hook. Owns the screen
// state machine, batch/round progression, scoring, clue/reveal state, the
// idle timers, journey/bonus accounting, and leaderboard actions. Per-round
// presentational concerns that don't affect gameplay (the local clock,
// weather) are deliberately kept OUT of this hook and live as small
// standalone hooks used directly by the screens that render them — see
// useWeather/useLocalClock. "Time on board" is the exception: it's part of
// gameplay state here, since the summary must show the batch's *finished*
// duration (batchEndMs), not a clock that keeps running while the boarding
// pass is on screen.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  Airport,
  Bonuses,
  ClueKey,
  Choice,
  Continent,
  HintKey,
  LbDir,
  LbSort,
  LeaderboardRow,
  Mode,
  Screen,
  StampRecord,
  TodayStats,
} from '../types';
import {
  BATCH_SIZE,
  CLUE_NUDGE_SECONDS,
  DATE_LINE_BONUS,
  ELITE_BONUS,
  LONG_HAUL_BONUS,
  LONG_HAUL_KM,
  FF_CITY_HINT_COST,
  IDLE_NUDGE_SECONDS,
  IDLE_SKIP_SECONDS,
  STREAK_LENGTH,
  UPGRADE_BONUS,
  roundPoints,
  buildBatch,
  continentBonus,
  crossesDateLine,
  haversineKm,
  makeChoices,
  makeFact,
  todayUTC,
  weekStartUTC,
} from '../lib/gameLogic';
import { rollEventLine } from '../lib/eventLines';
import { stampSlots } from '../lib/stampTemplates';
import type { LeaderboardClient } from '../lib/leaderboardClient';
import { getPlayerId } from '../lib/playerId';
import { reportBatch } from '../lib/metrics';
import { accumulateTime } from '../lib/timeMetric';
import { loadStampedToday, loadUsedToday, saveStampedToday, saveUsedToday } from '../lib/usedAirportsStore';

interface HintFlags {
  country: boolean;
  carrierNames: boolean;
  destNames: boolean;
}
interface ClueFlags {
  car: boolean;
  dest: boolean;
}

const MODE_KEY = 'gatecheck_mode';
const HOME_KEY = 'gatecheck_home_airport';

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'ff' ? 'ff' : 'gb';
  } catch {
    return 'gb';
  }
}

function loadHomeAirport(): string | null {
  try {
    const v = localStorage.getItem(HOME_KEY);
    return v && /^[A-Z]{3}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable — the choice just doesn't survive a reload.
  }
}

interface EngineState {
  screen: Screen;
  mode: Mode;
  /** Validated IATA from check-in. Required before round 1; scores auto-post to it. */
  homeAirport: string | null;
  batchNum: number;
  roundIdx: number;
  score: number;
  correct: number;
  hintsUsedTotal: number;
  doneRounds: number;
  answered: boolean;
  answeredIdx: number;
  timedOut: boolean;
  nudge: boolean;
  /** The 45s "clues are free" toast — separate from the 120s taxi-away nudge. */
  clueNudge: boolean;
  lastRoundPoints: number;
  /** Upgrade bonus banked on this round's answer (0 outside a streak hit). */
  lastUpgradeBonus: number;
  /** Great-circle leg to this round's answer from the previous correct guess (or home). */
  lastLegKm: number | null;
  lastLegFrom: string | null;
  /** This round's Oregon-Trail event line, when the ~40% gate fired. */
  eventLine: string | null;
  lastRoundStamp: StampRecord | null; // every correct answer earns one
  stamps: StampRecord[]; // this batch's stamps, in the order earned
  /** IATA codes of correct guesses, in round order — distance/map derive from this + home. */
  journey: string[];
  /** Per-round correct/missed flags in round order, for the boarding-pass map. */
  roundResults: boolean[];
  streak: number;
  bonuses: Bonuses;
  batchEndMs: number | null; // when the batch's final round was answered/skipped — freezes "time on board"
  saved: boolean;
  clues: ClueFlags;
  hints: HintFlags;
  revealedCities: number[]; // choice indices whose city has been revealed this round (FF)
  choices: Choice[];
  fact: string;
  lbRows: LeaderboardRow[];
  lbToday: TodayStats;
  lbSort: LbSort;
  lbDir: LbDir;
}

const NO_TODAY_STATS: TodayStats = { pax: 0, points: 0 };

const NO_CLUES: ClueFlags = { car: false, dest: false };
const NO_HINTS: HintFlags = { country: false, carrierNames: false, destNames: false };
const NO_BONUSES: Bonuses = { upgrades: 0, continents: 0, dateLine: 0, longHaul: 0, elite: 0 };

const initialState: EngineState = {
  screen: 'home',
  mode: loadMode(),
  homeAirport: loadHomeAirport(),
  batchNum: 0,
  roundIdx: 0,
  score: 0,
  correct: 0,
  hintsUsedTotal: 0,
  doneRounds: 0,
  answered: false,
  answeredIdx: -1,
  timedOut: false,
  nudge: false,
  clueNudge: false,
  lastRoundPoints: 0,
  lastUpgradeBonus: 0,
  lastLegKm: null,
  lastLegFrom: null,
  eventLine: null,
  lastRoundStamp: null,
  stamps: [],
  journey: [],
  roundResults: [],
  streak: 0,
  bonuses: NO_BONUSES,
  batchEndMs: null,
  saved: false,
  clues: NO_CLUES,
  hints: NO_HINTS,
  revealedCities: [],
  choices: [],
  fact: '',
  lbRows: [],
  lbToday: NO_TODAY_STATS,
  lbSort: 'total',
  lbDir: 'desc',
};

interface EndBonuses {
  continents: number;
  dateLine: number;
  longHaul: number;
  elite: number;
}

type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'GO_CHECKIN' }
  | { type: 'CHECK_IN'; iata: string }
  | { type: 'START_BATCH' }
  | { type: 'START_ROUND'; idx: number; choices: Choice[]; fact: string }
  | {
      type: 'PICK';
      idx: number;
      ok: boolean;
      points: number;
      upgradeBonus: number;
      legKm: number | null;
      legFrom: string | null;
      eventLine: string | null;
      stamp: StampRecord | null;
      now: number;
    }
  | { type: 'REVEAL' }
  | { type: 'SKIP_ROUND'; now: number; eventLine: string | null }
  | { type: 'GO_TO_SUMMARY'; now: number; end: EndBonuses }
  | { type: 'USE_HINT'; key: HintKey }
  | { type: 'PULL_CLUE'; key: ClueKey }
  | { type: 'REVEAL_CITY'; idx: number }
  | { type: 'SET_NUDGE'; value: boolean }
  | { type: 'SET_CLUE_NUDGE'; value: boolean }
  | { type: 'GO_HOME' }
  | { type: 'GO_LEADERBOARD' }
  | { type: 'SCORE_SAVED' }
  | { type: 'SET_LB_ROWS'; rows: LeaderboardRow[]; today: TodayStats }
  | { type: 'SET_LB_SORT'; sort: LbSort; dir: LbDir };

function reducer(state: EngineState, action: Action): EngineState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'GO_CHECKIN':
      return { ...state, screen: 'checkin', nudge: false };
    case 'CHECK_IN':
      return { ...state, homeAirport: action.iata };
    case 'START_BATCH':
      return {
        ...state,
        batchNum: state.batchNum + 1,
        score: 0,
        correct: 0,
        hintsUsedTotal: 0,
        doneRounds: 0,
        saved: false,
        lastRoundStamp: null,
        stamps: [],
        journey: [],
        roundResults: [],
        streak: 0,
        bonuses: NO_BONUSES,
        batchEndMs: null,
      };
    case 'START_ROUND':
      return {
        ...state,
        screen: 'game',
        roundIdx: action.idx,
        choices: action.choices,
        fact: action.fact,
        answered: false,
        answeredIdx: -1,
        timedOut: false,
        nudge: false,
        clueNudge: false,
        lastUpgradeBonus: 0,
        lastLegKm: null,
        lastLegFrom: null,
        eventLine: null,
        clues: NO_CLUES,
        hints: NO_HINTS,
        revealedCities: [],
      };
    case 'PICK':
      return {
        ...state,
        answered: true,
        answeredIdx: action.idx,
        timedOut: false,
        nudge: false,
        clueNudge: false,
        // Stamps are collectibles, not currency — they never move the score.
        // Upgrade bonuses do: they land with the answer that completed the streak.
        score: state.score + action.points + action.upgradeBonus,
        correct: state.correct + (action.ok ? 1 : 0),
        doneRounds: state.doneRounds + 1,
        lastRoundPoints: action.points,
        lastUpgradeBonus: action.upgradeBonus,
        lastLegKm: action.legKm,
        lastLegFrom: action.legFrom,
        eventLine: action.eventLine,
        lastRoundStamp: action.stamp,
        stamps: action.stamp ? [...state.stamps, action.stamp] : state.stamps,
        journey: action.ok && action.stamp ? [...state.journey, action.stamp.iata] : state.journey,
        roundResults: [...state.roundResults, action.ok],
        streak: action.ok ? state.streak + 1 : 0,
        bonuses: { ...state.bonuses, upgrades: state.bonuses.upgrades + action.upgradeBonus },
        // The batch's final answer freezes "time on board" — the summary shows
        // this fixed duration, not a still-ticking clock.
        batchEndMs: state.roundIdx + 1 >= BATCH_SIZE ? action.now : state.batchEndMs,
      };
    case 'REVEAL':
      // Mirrors the prototype's own guard (`if (this.state.answered) …`): only
      // advance to the reveal screen if we're still sitting on the answer we
      // set the timer for (a no-op if a skip already moved things along).
      return state.answered ? { ...state, screen: 'reveal' } : state;
    case 'SKIP_ROUND':
      return {
        ...state,
        answered: true,
        answeredIdx: -1,
        timedOut: true,
        nudge: false,
        clueNudge: false,
        lastRoundPoints: 0,
        lastUpgradeBonus: 0,
        lastLegKm: null,
        lastLegFrom: null,
        eventLine: action.eventLine,
        lastRoundStamp: null,
        roundResults: [...state.roundResults, false],
        streak: 0,
        batchEndMs: state.roundIdx + 1 >= BATCH_SIZE ? action.now : state.batchEndMs,
        screen: 'reveal',
      };
    case 'GO_TO_SUMMARY':
      // batchEndMs is normally already frozen by the final PICK/SKIP_ROUND;
      // the fallback only covers a short batch (pool ran dry below BATCH_SIZE).
      // End-of-batch bonuses (continents, date line, FF elite) land here so
      // the boarding pass and the auto-posted score both see the final total.
      return {
        ...state,
        screen: 'summary',
        batchEndMs: state.batchEndMs ?? action.now,
        score:
          state.score + action.end.continents + action.end.dateLine + action.end.longHaul + action.end.elite,
        bonuses: {
          ...state.bonuses,
          continents: action.end.continents,
          dateLine: action.end.dateLine,
          longHaul: action.end.longHaul,
          elite: action.end.elite,
        },
      };
    case 'USE_HINT':
      if (state.hints[action.key] || state.answered) return state;
      return {
        ...state,
        hints: { ...state.hints, [action.key]: true },
        hintsUsedTotal: state.hintsUsedTotal + 1,
      };
    case 'PULL_CLUE':
      if (state.clues[action.key]) return state;
      return { ...state, clues: { ...state.clues, [action.key]: true } };
    case 'REVEAL_CITY':
      if (state.answered || state.revealedCities.includes(action.idx)) return state;
      return { ...state, revealedCities: [...state.revealedCities, action.idx] };
    case 'SET_NUDGE':
      if (state.nudge === action.value) return state;
      return { ...state, nudge: action.value };
    case 'SET_CLUE_NUDGE':
      if (state.clueNudge === action.value) return state;
      return { ...state, clueNudge: action.value };
    case 'GO_HOME':
      return { ...state, screen: 'home', nudge: false };
    case 'GO_LEADERBOARD':
      return { ...state, screen: 'leaderboard' };
    case 'SCORE_SAVED':
      // Stays on 'summary' — the leaderboard is already rendered inline
      // there, so posting a score no longer needs to navigate anywhere.
      return { ...state, saved: true };
    case 'SET_LB_ROWS':
      return { ...state, lbRows: action.rows, lbToday: action.today };
    case 'SET_LB_SORT':
      return { ...state, lbSort: action.sort, lbDir: action.dir };
    default:
      return state;
  }
}

/**
 * How long the picked choice sits highlighted — accent border on the correct
 * answer, like a stamp of approval — before auto-advancing to the reveal
 * screen (unless superseded by a skip). 1000ms read as a flash; long enough
 * now to actually register before the screen moves on.
 */
const ANSWER_REVEAL_DELAY_MS = 1700;

/**
 * A ref whose contents are computed once, lazily, on first render — unlike
 * `useRef(expensiveInit())`, which evaluates `expensiveInit()` on every
 * render even though only the first call's result is kept. Returns a ref
 * typed as non-nullable `T`, so callers (elsewhere in this file, in other
 * closures) don't have to re-narrow away a `| null` on every access.
 */
function useLazyRef<T>(init: () => T): { current: T } {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = init();
  }
  return ref as { current: T };
}

export interface GameEngine {
  state: EngineState;
  currentAirport: Airport | undefined;
  byCode: Record<string, Airport>;
  /** This batch's airports in round order — the boarding-pass map's stops. */
  batch: Airport[];
  hintsUsedThisRound: number;
  batchStartMs: number | null;
  setMode: (mode: Mode) => void;
  goCheckin: () => void;
  /** Confirms the (already validated) home airport and starts boarding. */
  checkIn: (iata: string) => void;
  start: () => void;
  pick: (idx: number) => void;
  useHint: (key: HintKey) => void;
  pullClue: (key: ClueKey) => void;
  revealCity: (idx: number) => void;
  next: () => void;
  goHome: () => void;
  goLeaderboard: () => void;
  act: () => void;
  dismissNudge: () => void;
  sortByTotal: () => void;
  sortByAvg: () => void;
}

export function useGameEngine(
  airports: Airport[],
  byCode: Record<string, Airport>,
  leaderboardClient: LeaderboardClient,
): GameEngine {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Lazy-init from the persisted used/stamped sets, not `new Set()` — see
  // src/lib/usedAirportsStore.ts.
  const usedRef = useLazyRef<Set<string>>(loadUsedToday);
  const stampedRef = useLazyRef<Set<string>>(loadStampedToday);
  const batchRef = useRef<Airport[]>([]);
  const usedEventLinesRef = useRef<Set<string>>(new Set());
  const lastActRef = useRef<number>(Date.now());
  const batchStartRef = useRef<number | null>(null);

  const currentAirport = batchRef.current[state.roundIdx];
  const hintsUsedThisRound = Object.values(state.hints).filter(Boolean).length + state.revealedCities.length;
  // Only Frequent Flyer's city hints cost points (−1 each). Everything else —
  // clue pulls, the country reveal, name reveals, all of GB — is free.
  const hintsCostThisRound = state.mode === 'ff' ? state.revealedCities.length * FF_CITY_HINT_COST : 0;

  const act = useCallback(() => {
    lastActRef.current = Date.now();
    dispatch({ type: 'SET_NUDGE', value: false });
    dispatch({ type: 'SET_CLUE_NUDGE', value: false });
  }, []);

  const setMode = useCallback((mode: Mode) => {
    persist(MODE_KEY, mode);
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  const goCheckin = useCallback(() => {
    act();
    dispatch({ type: 'GO_CHECKIN' });
  }, [act]);

  const startRound = useCallback(
    (idx: number) => {
      const airport = batchRef.current[idx];
      if (!airport) return;
      const batchCodes = new Set(batchRef.current.map((a) => a.iata));
      const choices = makeChoices(airports, airport, batchCodes);
      // Distractors count as "seen" too — without this, a famous airport can
      // sit in the options one round and come back as the answer soon after.
      for (const c of choices) {
        if (!c.ok) usedRef.current.add(c.airport.iata);
      }
      saveUsedToday(usedRef.current);
      const fact = makeFact(airport, byCode);
      lastActRef.current = Date.now();
      dispatch({ type: 'START_ROUND', idx, choices, fact });
    },
    [airports, byCode, usedRef],
  );

  const startBatch = useCallback(() => {
    const home = byCode[state.homeAirport ?? ''];
    const batch = buildBatch(airports, usedRef.current, Math.random, {
      mode: state.mode,
      homeContinent: home?.continent as Continent | undefined,
    });
    saveUsedToday(usedRef.current);
    batchRef.current = batch;
    usedEventLinesRef.current = new Set();
    batchStartRef.current = Date.now();
    dispatch({ type: 'START_BATCH' });
    startRound(0);
    // `usedRef` is a stable object identity across renders (see useLazyRef)
    // — included for accuracy, but it never actually changes.
  }, [airports, byCode, startRound, state.homeAirport, state.mode, usedRef]);

  // Check-in is required before round 1 (the home airport anchors the draw
  // bias, the distance metric, and the auto-post); "Play again" skips it
  // because the answer can't have changed mid-session.
  const start = useCallback(() => {
    if (state.homeAirport) startBatch();
    else dispatch({ type: 'GO_CHECKIN' });
  }, [startBatch, state.homeAirport]);

  const checkIn = useCallback(
    (iata: string) => {
      const code = iata.toUpperCase();
      if (!byCode[code]) return;
      persist(HOME_KEY, code);
      dispatch({ type: 'CHECK_IN', iata: code });
      // startBatch reads homeAirport from state, which hasn't committed yet —
      // build this first batch's draw bias from the airport just checked in.
      const batch = buildBatch(airports, usedRef.current, Math.random, {
        mode: state.mode,
        homeContinent: byCode[code].continent as Continent,
      });
      saveUsedToday(usedRef.current);
      batchRef.current = batch;
      usedEventLinesRef.current = new Set();
      batchStartRef.current = Date.now();
      dispatch({ type: 'START_BATCH' });
      startRound(0);
    },
    [airports, byCode, startRound, state.mode, usedRef],
  );

  const revealTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  const pick = useCallback(
    (idx: number) => {
      if (state.answered) return;
      act();
      const choice = state.choices[idx];
      if (!choice) return;
      const ok = choice.ok;
      const points = ok ? roundPoints(hintsCostThisRound) : 0;
      // Upgrade bonus: +10 for every completed 3-correct streak, double in FF
      // — bonuses instead of penalties, so streaks feel like fare upgrades.
      const streak = ok ? state.streak + 1 : 0;
      const upgradeBonus =
        ok && streak > 0 && streak % STREAK_LENGTH === 0 ? UPGRADE_BONUS * (state.mode === 'ff' ? 2 : 1) : 0;
      // Every correct answer earns a stamp — ten right answers fill a page.
      // The day-scoped country set no longer gates the award, only whether
      // this one gets the reveal-screen press (`firstVisit`).
      let stamp: StampRecord | null = null;
      let legKm: number | null = null;
      let legFrom: string | null = null;
      if (ok && currentAirport) {
        const firstVisit = !stampedRef.current.has(currentAirport.country);
        if (firstVisit) {
          stampedRef.current.add(currentAirport.country);
          saveStampedToday(stampedRef.current);
        }
        stamp = {
          iata: currentAirport.iata,
          continent: currentAirport.continent,
          firstVisit,
          slots: stampSlots(currentAirport, todayUTC()),
        };
        // Distance flown: from the previous correctly-guessed airport, or
        // home for the journey's first leg.
        const fromCode = state.journey[state.journey.length - 1] ?? state.homeAirport;
        const from = fromCode ? byCode[fromCode] : undefined;
        if (from) {
          legKm = haversineKm(from.latitude, from.longitude, currentAirport.latitude, currentAirport.longitude);
          legFrom = from.iata;
        }
      }
      const eventLine = rollEventLine(ok ? 'positive' : 'negative', usedEventLinesRef.current);
      dispatch({ type: 'PICK', idx, ok, points, upgradeBonus, legKm, legFrom, eventLine, stamp, now: Date.now() });
      if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'REVEAL' });
      }, ANSWER_REVEAL_DELAY_MS);
    },
    [act, byCode, currentAirport, hintsCostThisRound, stampedRef, state.answered, state.choices, state.homeAirport, state.journey, state.mode, state.streak],
  );

  const useHint = useCallback(
    (key: HintKey) => {
      act();
      dispatch({ type: 'USE_HINT', key });
    },
    [act],
  );

  const pullClue = useCallback(
    (key: ClueKey) => {
      act();
      dispatch({ type: 'PULL_CLUE', key });
    },
    [act],
  );

  const revealCity = useCallback(
    (idx: number) => {
      act();
      dispatch({ type: 'REVEAL_CITY', idx });
    },
    [act],
  );

  const next = useCallback(() => {
    const nextIdx = state.roundIdx + 1;
    if (nextIdx >= Math.min(BATCH_SIZE, batchRef.current.length)) {
      // End-of-batch bonuses, computed here so the summary dispatch carries
      // the final score in one step (and the auto-post effect below sees it).
      const continentsTouched = new Set(state.stamps.map((s) => s.continent)).size;
      const legs = [state.homeAirport, ...state.journey]
        .map((code) => (code ? byCode[code] : undefined))
        .filter((a): a is Airport => Boolean(a));
      // Both leg bonuses pay once per batch however many legs qualify — the
      // same rule the date line already used, and what keeps the score
      // ceiling (and so the gauge) from ballooning with ten long hauls.
      let dateLine = 0;
      let longHaul = 0;
      for (let i = 1; i < legs.length; i++) {
        const from = legs[i - 1];
        const to = legs[i];
        if (crossesDateLine(from.longitude, to.longitude)) dateLine = DATE_LINE_BONUS;
        if (haversineKm(from.latitude, from.longitude, to.latitude, to.longitude) >= LONG_HAUL_KM) {
          longHaul = LONG_HAUL_BONUS;
        }
        if (dateLine && longHaul) break;
      }
      const end: EndBonuses = {
        continents: continentBonus(continentsTouched),
        dateLine,
        longHaul,
        elite: state.mode === 'ff' ? ELITE_BONUS : 0,
      };
      if (batchStartRef.current != null) {
        accumulateTime(Math.floor((Date.now() - batchStartRef.current) / 1000));
        // One anonymous row per finished batch (fire-and-forget, same trust
        // model as the visits ping). Duration runs to the final answer/skip
        // (batchEndMs), not to this button click. Score includes end bonuses.
        reportBatch({
          durationSeconds: Math.max(0, Math.floor(((state.batchEndMs ?? Date.now()) - batchStartRef.current) / 1000)),
          score: state.score + end.continents + end.dateLine + end.longHaul + end.elite,
          correct: state.correct,
          hintsUsed: state.hintsUsedTotal,
          stamps: state.stamps.length,
        });
      }
      dispatch({ type: 'GO_TO_SUMMARY', now: Date.now(), end });
    } else {
      startRound(nextIdx);
    }
  }, [byCode, startRound, state.batchEndMs, state.correct, state.hintsUsedTotal, state.homeAirport, state.journey, state.mode, state.roundIdx, state.score, state.stamps]);

  const goHome = useCallback(() => {
    act();
    dispatch({ type: 'GO_HOME' });
  }, [act]);

  const goLeaderboard = useCallback(() => {
    dispatch({ type: 'GO_LEADERBOARD' });
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    const { rows, today } = await leaderboardClient.getLeaderboard({
      weekStart: weekStartUTC(),
      today: todayUTC(),
      sort: state.lbSort,
      dir: state.lbDir,
      playerId: getPlayerId(),
    });
    dispatch({ type: 'SET_LB_ROWS', rows, today });
  }, [leaderboardClient, state.lbDir, state.lbSort]);

  // 'summary' loads the board the instant a batch finishes — no click
  // required — alongside the standalone 'leaderboard' screen (Home's
  // pre-game "Flight Leaders" entry point).
  useEffect(() => {
    if (state.screen === 'leaderboard' || state.screen === 'summary') {
      refreshLeaderboard().catch(() => {
        dispatch({ type: 'SET_LB_ROWS', rows: [], today: NO_TODAY_STATS });
      });
    }
  }, [state.screen, state.lbSort, state.lbDir, refreshLeaderboard]);

  // Auto-post: the home airport was captured at check-in, so a finished
  // journey lands on the board with no form — killing the "embarrassed to
  // type my airport" drop-off. Only full sets of 10 count, as before.
  useEffect(() => {
    if (state.screen !== 'summary' || state.saved) return;
    if (state.doneRounds < BATCH_SIZE || !state.homeAirport) return;
    dispatch({ type: 'SCORE_SAVED' }); // optimistic guard against double-posting
    void leaderboardClient
      .submitScore({ airport: state.homeAirport, playerId: getPlayerId(), score: state.score })
      .then((result) => {
        if (result.ok) {
          // Refresh right away so the player's own row/rank shows up
          // immediately rather than waiting on the screen-driven effect.
          refreshLeaderboard().catch(() => {
            dispatch({ type: 'SET_LB_ROWS', rows: [], today: NO_TODAY_STATS });
          });
        }
      });
  }, [leaderboardClient, refreshLeaderboard, state.doneRounds, state.homeAirport, state.saved, state.score, state.screen]);

  const sortByTotal = useCallback(() => {
    if (state.lbSort !== 'total') dispatch({ type: 'SET_LB_SORT', sort: 'total', dir: 'desc' });
    else dispatch({ type: 'SET_LB_SORT', sort: 'total', dir: state.lbDir === 'desc' ? 'asc' : 'desc' });
  }, [state.lbDir, state.lbSort]);

  const sortByAvg = useCallback(() => {
    if (state.lbSort !== 'avg') dispatch({ type: 'SET_LB_SORT', sort: 'avg', dir: 'desc' });
    else dispatch({ type: 'SET_LB_SORT', sort: 'avg', dir: state.lbDir === 'desc' ? 'asc' : 'desc' });
  }, [state.lbDir, state.lbSort]);

  // Idle timers — 45s clue nudge (zero clues pulled), 120s taxi-away dialog,
  // 150s auto-skip — active only while sitting on an unanswered game round.
  const cluesPulled = state.clues.car || state.clues.dest || hintsUsedThisRound > 0;
  useEffect(() => {
    if (state.screen !== 'game' || state.answered) return;
    const id = setInterval(() => {
      const idleSeconds = (Date.now() - lastActRef.current) / 1000;
      if (idleSeconds > IDLE_SKIP_SECONDS) {
        const eventLine = rollEventLine('negative', usedEventLinesRef.current);
        dispatch({ type: 'SKIP_ROUND', now: Date.now(), eventLine });
      } else if (idleSeconds > IDLE_NUDGE_SECONDS) {
        dispatch({ type: 'SET_NUDGE', value: true });
      } else if (idleSeconds > CLUE_NUDGE_SECONDS && !cluesPulled) {
        dispatch({ type: 'SET_CLUE_NUDGE', value: true });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.screen, state.answered, cluesPulled]);

  return useMemo(
    () => ({
      state,
      currentAirport,
      byCode,
      batch: batchRef.current,
      hintsUsedThisRound,
      batchStartMs: batchStartRef.current,
      setMode,
      goCheckin,
      checkIn,
      start,
      pick,
      useHint,
      pullClue,
      revealCity,
      next,
      goHome,
      goLeaderboard,
      act,
      dismissNudge: act,
      sortByTotal,
      sortByAvg,
    }),
    [
      state,
      currentAirport,
      byCode,
      hintsUsedThisRound,
      setMode,
      goCheckin,
      checkIn,
      start,
      // batchRef.current / batchStartRef.current are intentionally read fresh
      // each render rather than added here — refs aren't reactive dependencies.
      pick,
      useHint,
      pullClue,
      revealCity,
      next,
      goHome,
      goLeaderboard,
      act,
      sortByTotal,
      sortByAvg,
    ],
  );
}
