import { useCallback, useEffect, useRef, useState } from 'react';
import type { StampRecord } from '../../../types';
import { ffTier } from '../../../lib/gameLogic';
import PassportStamp from '../../PassportStamp';
import './PassportBook.css';

interface Props {
  stamps: StampRecord[];
  score: number;
  flightNo: string;
  /** The check-in airport — printed on the holder page as the journey's origin. */
  homeAirport: string | null;
  onClose: () => void;
}

/** How long the spread stays open before folding itself away, unprompted. */
const HOLD_MS = 1500;
const FOLD_MS = 320;
/** Stamps land in the order they were earned, so the page replays the route flown. */
const STAMP_STAGGER_MS = 110;
const COVER_MS = 620;

// Hand-placed rather than gridded: three pairs deliberately clip each other,
// the rest breathe. Percentages of the stamp field — `top` stops at 62% so the
// tallest die (a round one, ~84px) still clears the bottom of the page.
const SPOTS: Array<[number, number]> = [
  [1, 0],
  [40, 3],
  [28, 11],
  [3, 24],
  [46, 26],
  [20, 38],
  [45, 46],
  [1, 48],
  [26, 58],
  [48, 62],
];

/**
 * The passport spread that opens as the summary screen arrives: cover swings,
 * paper rises behind it, then the batch's stamps land one after another.
 *
 * It closes itself. This is a transition rather than a permanent block —
 * the summary's fixed space belongs to the boarding pass and Flight Leaders,
 * and a spread this tall would bury the leaderboard.
 */
export default function PassportBook({ stamps, score, flightNo, homeAirport, onClose }: Props) {
  const [closing, setClosing] = useState(false);
  const timers = useRef<number[]>([]);

  const beginClose = useCallback(() => {
    setClosing(true);
    timers.current.push(window.setTimeout(onClose, FOLD_MS));
  }, [onClose]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const landed = reduced ? 0 : COVER_MS + stamps.length * STAMP_STAGGER_MS;
    timers.current.push(window.setTimeout(() => setClosing(true), landed + HOLD_MS));
    timers.current.push(window.setTimeout(onClose, landed + HOLD_MS + FOLD_MS));
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [onClose, stamps.length]);

  // Escape closes it early, as does clicking the backdrop or the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginClose]);

  const mrz =
    'P<GCKGATECHECK<<PLAYER<<<<<<<<<<<<<<<<<<<<<<\n' +
    `${stamps.map((s) => s.iata).join('')}<<<${String(stamps.length).padStart(2, '0')}<<<<${flightNo.replace(/\W/g, '')}<<<<<<<<<<`;

  return (
    <div
      className={`gc-pp-backdrop${closing ? ' gc-pp-closing' : ''}`}
      onClick={beginClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Passport — ${stamps.length} stamps this group`}
    >
      {/* The book swallows clicks so only the backdrop dismisses. */}
      <div className="gc-pp-book" onClick={(e) => e.stopPropagation()}>
        <div className="gc-pp-spread">
          <div className="gc-pp-page gc-pp-page-l">
            <div className="gc-pp-hd">
              <span>Passport · Gate Check</span>
              <span>{stamps[0]?.slots.date ?? ''}</span>
            </div>
            <div className="gc-pp-holder">
              <div className="gc-pp-photo" aria-hidden="true">
                <svg viewBox="0 0 48 56" width="42">
                  <circle cx="24" cy="19" r="11" fill="rgba(58,62,96,0.2)" />
                  <path d="M4 56c0-11 9-19 20-19s20 8 20 19z" fill="rgba(58,62,96,0.2)" />
                </svg>
              </div>
              <div className="gc-pp-fields">
                <div>
                  <span className="gc-pp-l">Bearer</span>
                  <span className="gc-pp-v">{flightNo}</span>
                </div>
                <div>
                  <span className="gc-pp-l">Status</span>
                  <span className="gc-pp-v">{ffTier(score)}</span>
                </div>
                {homeAirport && (
                  <div>
                    <span className="gc-pp-l">Home airport</span>
                    <span className="gc-pp-v">{homeAirport}</span>
                  </div>
                )}
                <div>
                  <span className="gc-pp-l">Stamps</span>
                  <span className="gc-pp-v">{stamps.length}</span>
                </div>
              </div>
            </div>
            <div className="gc-pp-mrz">{mrz}</div>
          </div>

          <div className="gc-pp-page">
            <div className="gc-pp-hd">
              <span>Visas · Stamps</span>
              <span>Page 4</span>
            </div>
            {/* gc-on-paper switches every die to its true ink (see PassportStamp.css). */}
            <div className="gc-pp-field gc-on-paper">
              {stamps.map((stamp, i) => {
                const [left, top] = SPOTS[i % SPOTS.length];
                return (
                  <span key={`${stamp.iata}-${i}`} style={{ left: `${left}%`, top: `${top}%`, zIndex: i + 1 }}>
                    <PassportStamp
                      stamp={stamp}
                      width={84}
                      animate
                      delayMs={COVER_MS + i * STAMP_STAGGER_MS}
                    />
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="gc-pp-cover">
          <div className="gc-pp-cover-inner">
            <svg viewBox="0 0 64 64" width="46" aria-hidden="true">
              <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.9" />
              <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
              <g transform="translate(20 20)" fill="currentColor">
                <path d="M21 16v-2l-8-2.5V6a1.5 1.5 0 0 0-3 0v5.5L2 14v2l8-1.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-4.5z" />
              </g>
            </svg>
            <div className="gc-pp-cover-t">PASSPORT</div>
            <div className="gc-pp-cover-s">GATE CHECK</div>
          </div>
        </div>
      </div>

      <button className="gc-pp-close" onClick={beginClose} type="button">
        Back to boarding pass
      </button>
    </div>
  );
}
