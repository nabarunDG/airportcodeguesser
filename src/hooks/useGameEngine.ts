// The ported prototype `Component` class, as a React hook. Owns the screen
// state machine, batch/round progression, scoring, hint/clue reveal state,
// the idle timer, and leaderboard actions. Per-round presentational
// concerns that don't affect gameplay (the local clock, weather, live
// "time on board" duration) are deliberately kept OUT of this hook and live
// as small standalone hooks used directly by the screens that render them —
// see useWeather/useLocalClock/useLiveDuration.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Airport, ClueKey, Choice, HintKey, LbDir, LbSort, LeaderboardRow, Screen, TodayStats } from '../types';
import {
  BATCH_SIZE,
  CITY_REVEAL_COST,
  HINT_COST,
  IDLE_NUDGE_SECONDS,
  IDLE_SKIP_SECONDS,
  buildBatch,
  makeBarcode,
  makeChoices,
  makeFact,
  roundPoints,
  todayUTC,
  weekStartUTC,
  type BarcodeBar,
} from '../lib/gameLogic';
import type { LeaderboardClient } from '../lib/leaderboardClient';
import { getPlayerId } from '../lib/playerId';
import { accumulateTime } from '../lib/timeMetric';
import { loadUsedToday, saveUsedToday } from '../lib/usedAirportsStore';

interface HintFlags {
  country: boolean;
  carrierNames: boolean;
  destNames: boolean;
}
interface ClueFlags {
  car: boolean;
  dest: boolean;
}

interface EngineState {
  screen: Screen;
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
  lastRoundPoints: number;
  clues: ClueFlags;
  hints: HintFlags;
  revealedCities: number[]; // choice indices whose city has been paid-reveal'd this round
  choices: Choice[];
  fact: string;
  barcode: BarcodeBar[];
  homeInput: string;
  homeErr: string;
  saved: boolean;
  lbRows: LeaderboardRow[];
  lbToday: TodayStats;
  lbSort: LbSort;
  lbDir: LbDir;
}

const NO_TODAY_STATS: TodayStats = { pax: 0, points: 0 };

const NO_CLUES: ClueFlags = { car: false, dest: false };
const NO_HINTS: HintFlags = { country: false, carrierNames: false, destNames: false };

const initialState: EngineState = {
  screen: 'home',
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
  lastRoundPoints: 0,
  clues: NO_CLUES,
  hints: NO_HINTS,
  revealedCities: [],
  choices: [],
  fact: '',
  barcode: [],
  homeInput: '',
  homeErr: '',
  saved: false,
  lbRows: [],
  lbToday: NO_TODAY_STATS,
  lbSort: 'total',
  lbDir: 'desc',
};

type Action =
  | { type: 'START_BATCH'; barcode: BarcodeBar[] }
  | { type: 'START_ROUND'; idx: number; choices: Choice[]; fact: string }
  | { type: 'PICK'; idx: number; ok: boolean; points: number }
  | { type: 'REVEAL' }
  | { type: 'SKIP_ROUND' }
  | { type: 'GO_TO_SUMMARY' }
  | { type: 'USE_HINT'; key: HintKey }
  | { type: 'PULL_CLUE'; key: ClueKey }
  | { type: 'REVEAL_CITY'; idx: number }
  | { type: 'SET_NUDGE'; value: boolean }
  | { type: 'GO_HOME' }
  | { type: 'GO_LEADERBOARD' }
  | { type: 'SET_HOME_INPUT'; value: string }
  | { type: 'SET_HOME_ERR'; value: string }
  | { type: 'SCORE_SAVED' }
  | { type: 'SET_LB_ROWS'; rows: LeaderboardRow[]; today: TodayStats }
  | { type: 'SET_LB_SORT'; sort: LbSort; dir: LbDir };

function reducer(state: EngineState, action: Action): EngineState {
  switch (action.type) {
    case 'START_BATCH':
      return {
        ...state,
        batchNum: state.batchNum + 1,
        score: 0,
        correct: 0,
        hintsUsedTotal: 0,
        doneRounds: 0,
        saved: false,
        homeInput: '',
        homeErr: '',
        barcode: action.barcode,
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
        score: state.score + action.points,
        correct: state.correct + (action.ok ? 1 : 0),
        doneRounds: state.doneRounds + 1,
        lastRoundPoints: action.points,
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
        lastRoundPoints: 0,
        screen: 'reveal',
      };
    case 'GO_TO_SUMMARY':
      return { ...state, screen: 'summary' };
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
    case 'GO_HOME':
      return { ...state, screen: 'home', nudge: false };
    case 'GO_LEADERBOARD':
      return { ...state, screen: 'leaderboard' };
    case 'SET_HOME_INPUT':
      return { ...state, homeInput: action.value, homeErr: '' };
    case 'SET_HOME_ERR':
      return { ...state, homeErr: action.value };
    case 'SCORE_SAVED':
      // Stays on 'summary' — the leaderboard is already rendered inline
      // there, so posting a score no longer needs to navigate anywhere.
      return { ...state, saved: true, homeErr: '' };
    case 'SET_LB_ROWS':
      return { ...state, lbRows: action.rows, lbToday: action.today };
    case 'SET_LB_SORT':
      return { ...state, lbSort: action.sort, lbDir: action.dir };
    default:
      return state;
  }
}

/** Reveals the "PICK" transition to 'reveal' after the 1s colored-choice-state pause, unless superseded (e.g. by a skip). */
const ANSWER_REVEAL_DELAY_MS = 1000;

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
  hintsUsedThisRound: number;
  batchStartMs: number | null;
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
  setHomeInput: (value: string) => void;
  saveScore: () => Promise<void>;
  sortByTotal: () => void;
  sortByAvg: () => void;
}

export function useGameEngine(
  airports: Airport[],
  byCode: Record<string, Airport>,
  leaderboardClient: LeaderboardClient,
): GameEngine {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Lazy-init from today's (UTC) persisted used-set, not `new Set()` — see
  // src/lib/usedAirportsStore.ts.
  const usedRef = useLazyRef<Set<string>>(loadUsedToday);
  const batchRef = useRef<Airport[]>([]);
  const lastActRef = useRef<number>(Date.now());
  const batchStartRef = useRef<number | null>(null);

  const currentAirport = batchRef.current[state.roundIdx];
  const hintsUsedThisRound = Object.values(state.hints).filter(Boolean).length + state.revealedCities.length;
  // Boolean hints (country/carrierNames/destNames) each cost HINT_COST; every
  // per-option city reveal costs CITY_REVEAL_COST — summed for `roundPoints`,
  // since the two kinds of reveal aren't priced the same.
  const hintsCostThisRound =
    Object.values(state.hints).filter(Boolean).length * HINT_COST + state.revealedCities.length * CITY_REVEAL_COST;

  const act = useCallback(() => {
    lastActRef.current = Date.now();
    dispatch({ type: 'SET_NUDGE', value: false });
  }, []);

  const startRound = useCallback(
    (idx: number) => {
      const airport = batchRef.current[idx];
      if (!airport) return;
      const choices = makeChoices(airports, airport);
      const fact = makeFact(airport, byCode);
      lastActRef.current = Date.now();
      dispatch({ type: 'START_ROUND', idx, choices, fact });
    },
    [airports, byCode],
  );

  const startBatch = useCallback(() => {
    const batch = buildBatch(airports, usedRef.current);
    saveUsedToday(usedRef.current);
    batchRef.current = batch;
    batchStartRef.current = Date.now();
    dispatch({ type: 'START_BATCH', barcode: makeBarcode() });
    startRound(0);
    // `usedRef` is a stable object identity across renders (see useLazyRef)
    // — included for accuracy, but it never actually changes.
  }, [airports, startRound, usedRef]);

  const start = useCallback(() => {
    startBatch();
  }, [startBatch]);

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
      const points = choice.ok ? roundPoints(hintsCostThisRound) : 0;
      dispatch({ type: 'PICK', idx, ok: choice.ok, points });
      if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'REVEAL' });
      }, ANSWER_REVEAL_DELAY_MS);
    },
    [act, hintsCostThisRound, state.answered, state.choices],
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
      if (batchStartRef.current != null) {
        accumulateTime(Math.floor((Date.now() - batchStartRef.current) / 1000));
      }
      dispatch({ type: 'GO_TO_SUMMARY' });
    } else {
      startRound(nextIdx);
    }
  }, [startRound, state.roundIdx]);

  const goHome = useCallback(() => {
    act();
    dispatch({ type: 'GO_HOME' });
  }, [act]);

  const goLeaderboard = useCallback(() => {
    dispatch({ type: 'GO_LEADERBOARD' });
  }, []);

  const setHomeInput = useCallback((value: string) => {
    dispatch({ type: 'SET_HOME_INPUT', value: value.toUpperCase().slice(0, 3) });
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

  const saveScore = useCallback(async () => {
    const home = state.homeInput.toUpperCase().trim();
    if (!home) {
      dispatch({ type: 'SET_HOME_ERR', value: "Enter your home airport's 3-letter code." });
      return;
    }
    if (!byCode[home]) {
      dispatch({ type: 'SET_HOME_ERR', value: `${home} isn't a commercial airport we know — try your nearest one.` });
      return;
    }
    if (state.doneRounds < BATCH_SIZE) {
      dispatch({
        type: 'SET_HOME_ERR',
        value: "Only full sets of 10 count — this group had skipped rounds, so it can't be posted.",
      });
      return;
    }
    const result = await leaderboardClient.submitScore({ airport: home, playerId: getPlayerId(), score: state.score });
    if (!result.ok) {
      dispatch({ type: 'SET_HOME_ERR', value: result.error ?? 'Could not post your score — try again.' });
      return;
    }
    dispatch({ type: 'SCORE_SAVED' });
    // Refresh right away so the player's own row/rank shows up immediately,
    // rather than waiting on the screen-driven effect (screen doesn't change
    // on save anymore — we're already sitting on 'summary').
    refreshLeaderboard().catch(() => {
      dispatch({ type: 'SET_LB_ROWS', rows: [], today: NO_TODAY_STATS });
    });
  }, [byCode, leaderboardClient, refreshLeaderboard, state.doneRounds, state.homeInput, state.score]);

  const sortByTotal = useCallback(() => {
    if (state.lbSort !== 'total') dispatch({ type: 'SET_LB_SORT', sort: 'total', dir: 'desc' });
    else dispatch({ type: 'SET_LB_SORT', sort: 'total', dir: state.lbDir === 'desc' ? 'asc' : 'desc' });
  }, [state.lbDir, state.lbSort]);

  const sortByAvg = useCallback(() => {
    if (state.lbSort !== 'avg') dispatch({ type: 'SET_LB_SORT', sort: 'avg', dir: 'desc' });
    else dispatch({ type: 'SET_LB_SORT', sort: 'avg', dir: state.lbDir === 'desc' ? 'asc' : 'desc' });
  }, [state.lbDir, state.lbSort]);

  // Idle timer — 120s nudge, 150s auto-skip — active only while sitting on an
  // unanswered game round, matching the design README's timeout rules.
  useEffect(() => {
    if (state.screen !== 'game' || state.answered) return;
    const id = setInterval(() => {
      const idleSeconds = (Date.now() - lastActRef.current) / 1000;
      if (idleSeconds > IDLE_SKIP_SECONDS) {
        dispatch({ type: 'SKIP_ROUND' });
      } else if (idleSeconds > IDLE_NUDGE_SECONDS) {
        dispatch({ type: 'SET_NUDGE', value: true });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.screen, state.answered]);

  return useMemo(
    () => ({
      state,
      currentAirport,
      byCode,
      hintsUsedThisRound,
      batchStartMs: batchStartRef.current,
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
      setHomeInput,
      saveScore,
      sortByTotal,
      sortByAvg,
    }),
    [
      state,
      currentAirport,
      byCode,
      hintsUsedThisRound,
      start,
      // batchStartRef.current is intentionally read fresh each render (see
      // above) rather than added here — refs aren't reactive dependencies.
      pick,
      useHint,
      pullClue,
      revealCity,
      next,
      goHome,
      goLeaderboard,
      act,
      setHomeInput,
      saveScore,
      sortByTotal,
      sortByAvg,
    ],
  );
}
