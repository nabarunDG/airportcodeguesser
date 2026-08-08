import { useCallback, useMemo, useState } from 'react';
import type { GameEngine } from '../../hooks/useGameEngine';
import {
  boardGroup,
  ffTier,
  fmtDistance,
  LONG_HAUL_KM,
  fmtDur,
  haversineKm,
  journeyMilestone,
  todayDisplay,
} from '../../lib/gameLogic';
import type { Airport } from '../../types';
import PassportStamp from '../PassportStamp';
import TrademarkFooter from '../TrademarkFooter';
import FlightLeadersBoard from './summary/FlightLeadersBoard';
import FlightPathMap, { type MapStop } from './summary/FlightPathMap';
import PassportBook from './summary/PassportBook';

interface Props {
  engine: GameEngine;
}

export default function SummaryScreen({ engine }: Props) {
  const { state, batch, byCode } = engine;
  // The passport opens over this screen on arrival, then folds itself away
  // into the row below — a transition, not a block, so Flight Leaders keeps
  // its place. Reopenable from the row.
  const [passportOpen, setPassportOpen] = useState(state.stamps.length > 0);
  const closePassport = useCallback(() => setPassportOpen(false), []);
  const onOpenPassport = useCallback(() => setPassportOpen(true), []);
  // Static, not a live ticking duration: "time on board" is the flight time
  // for the batch, fixed when its last round was answered (state.batchEndMs).
  const batchTime =
    engine.batchStartMs != null && state.batchEndMs != null
      ? fmtDur(Math.max(0, Math.floor((state.batchEndMs - engine.batchStartMs) / 1000)))
      : '—';
  const group = boardGroup(state.score);
  const flightNo = `GC-${state.batchNum}0${state.correct}`;

  const home = state.homeAirport ? byCode[state.homeAirport] : undefined;
  const milestone = journeyMilestone(state.stamps.length);
  const journeyLabel = milestone
    ? `${milestone} journey`
    : `${state.stamps.length} stamp${state.stamps.length === 1 ? '' : 's'} collected`;

  // Journeys are graded by milestone, never pass/fail — the banner always
  // names what was achieved; below 4 stamps it's just the honest count.
  const { stops, routeCells, totalKm } = useMemo(() => {
    // The map shows only the batch's ten stops; home anchors the route line
    // and the distance math but stays off the map itself.
    const stops: MapStop[] = batch.map((a, i) => ({ airport: a, correct: state.roundResults[i] === true }));
    const routeCells = [
      ...(home ? [{ code: home.iata, missed: false }] : []),
      ...batch.map((a, i) => ({ code: a.iata, missed: state.roundResults[i] !== true })),
    ];
    // Miles flown runs leg by leg between correct guesses, starting at home —
    // the same legs the reveal screen reported.
    const flown: Airport[] = [
      ...(home ? [home] : []),
      ...state.journey.map((code) => byCode[code]).filter((a): a is Airport => Boolean(a)),
    ];
    let totalKm = 0;
    for (let i = 1; i < flown.length; i++) {
      totalKm += haversineKm(flown[i - 1].latitude, flown[i - 1].longitude, flown[i].latitude, flown[i].longitude);
    }
    return { stops, routeCells, totalKm };
  }, [batch, byCode, home, state.journey, state.roundResults]);

  const continentsTouched = new Set(state.stamps.map((s) => s.continent)).size;
  // Every bonus the batch banked, spelled out under the stamps — the score up
  // top stays a single number.
  const bonusLines = [
    state.bonuses.upgrades > 0 ? `Streak upgrade bonus +${state.bonuses.upgrades}` : null,
    state.bonuses.continents > 0 ? `${continentsTouched} continents visited +${state.bonuses.continents}` : null,
    state.bonuses.dateLine > 0 ? `International date line crossed +${state.bonuses.dateLine}` : null,
    state.bonuses.longHaul > 0
      ? `Long haul over ${LONG_HAUL_KM.toLocaleString('en-US')} km +${state.bonuses.longHaul}`
      : null,
    state.bonuses.elite > 0 ? `Elite fare bonus +${state.bonuses.elite}` : null,
  ].filter((l): l is string => Boolean(l));

  const label = { fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' } as const;

  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 620,
        margin: '0 auto',
        padding: '12px 20px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <div style={{ width: 'min(400px, 100%)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        {/* Play again lives up here, level with the card's name, because the
            card is taller than a phone screen — reaching the bottom button
            meant scrolling past everything. */}
        <div style={{ padding: '10px 12px 10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--color-section)' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, letterSpacing: '0.12em', fontSize: 13 }}>GATE CHECK AIR</span>
          <button
            onClick={engine.start}
            style={{
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              color: 'var(--color-accent-100)',
              background: 'transparent',
              border: '1px solid var(--color-accent-300)',
              borderRadius: 20,
              padding: '6px 14px',
              minHeight: 34,
            }}
          >
            Play again
          </button>
        </div>

        {/* Journey banner: score beside the milestone the batch earned. */}
        <div style={{ padding: '14px 18px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={label}>Score</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 40, color: 'var(--color-accent)', lineHeight: 1 }}>{state.score}</span>
          <span style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--color-accent)', textTransform: 'uppercase', textAlign: 'right' }}>
            {journeyLabel}
          </span>
        </div>
        {state.stamps.length > 0 && (
          <div style={{ padding: '12px 16px 4px', display: 'flex', flexWrap: 'wrap', gap: '8px 10px', alignItems: 'center' }}>
            {state.stamps.map((stamp, i) => (
              <PassportStamp key={`${stamp.iata}-${i}`} stamp={stamp} width={String(stamp.continent).match(/^(AS|NA|OC)$/) ? 66 : 52} />
            ))}
            <button
              onClick={onOpenPassport}
              style={{
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
                color: 'var(--color-accent)',
                background: 'transparent',
                border: 0,
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Open passport
            </button>
          </div>
        )}

        {bonusLines.length > 0 && (
          <div style={{ padding: '4px 18px 0', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
            {bonusLines.map((line) => (
              <div key={line} style={{ fontSize: 11, color: 'var(--color-accent-300)' }}>
                ✦ {line}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '8px 18px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 10px', textAlign: 'left' }}>
          <SummaryField label="Frequent Flyer Status" value={ffTier(state.score)} accent />
          <SummaryField label="Flight" value={flightNo} mono />
          <SummaryField label="Correct" value={`${state.correct} / 10`} mono />
          <SummaryField label="Boarding group" value={String(group)} mono />
          <SummaryField label="Stamps" value={String(state.stamps.length)} mono />
          <SummaryField label="Continents" value={`${continentsTouched} / 6`} mono />
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={label}>Distance flown</div>
            <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {totalKm > 0 ? fmtDistance(totalKm) : '—'}
            </div>
          </div>
        </div>

        {/* The journey, mapped: numbered stops in round order (see the
            handoff's 1f). Home is the unnumbered white dot. */}
        {stops.length > 0 && (
          <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: 12, textAlign: 'left' }}>
            <FlightPathMap stops={stops} />
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-neutral-500)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                padding: '6px 4px 0',
              }}
            >
              {/* Deliberate two-row break — 5 codes + a hanging arrow up top,
                  6 below — instead of whatever ragged wrap the viewport gives. */}
              {(routeCells.length > 6 ? [routeCells.slice(0, 5), routeCells.slice(5)] : [routeCells]).map((row, r, rows) => (
                <div key={r}>
                  {row.map((cell, i) => (
                    <span key={`${cell.code}-${i}`}>
                      {i > 0 && ' → '}
                      <span style={cell.missed ? { color: 'var(--color-neutral-700)', textDecoration: 'line-through' } : undefined}>
                        {cell.code}
                      </span>
                    </span>
                  ))}
                  {rows.length > 1 && r === 0 && ' →'}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--color-neutral-400)', padding: '4px 4px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'var(--color-accent-600)', border: '1.5px solid var(--color-accent-100)' }} />
                stamped
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#14151d', border: '1.5px dashed var(--color-neutral-400)' }} />
                missed
              </span>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10.5, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
          <span>{todayDisplay()} UTC</span>
          <span>time on board {batchTime}</span>
        </div>

        {/* The leaderboard as the boarding pass's "stub" — same card, torn off
            rather than a separate screen. The score up top already posted
            itself to the check-in airport; no form here anymore. */}
        <div style={{ borderTop: '1.5px dashed var(--color-divider)', padding: '16px 18px', textAlign: 'left' }}>
          <FlightLeadersBoard engine={engine} />
        </div>
      </div>

      <button className="btn btn-primary" onClick={engine.start} style={{ minHeight: 44, minWidth: 220 }}>
        New boarding group
      </button>

      <TrademarkFooter />

      {passportOpen && state.stamps.length > 0 && (
        <PassportBook stamps={state.stamps} score={state.score} flightNo={flightNo} homeAirport={state.homeAirport} onClose={closePassport} />
      )}
    </div>
  );
}

function SummaryField({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          color: accent ? 'var(--color-accent-300)' : undefined,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
